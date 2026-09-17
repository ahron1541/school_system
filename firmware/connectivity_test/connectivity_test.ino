#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_system.h>
#include "secrets.h"

// This stage reads a synthetic UID from USB serial, not from a PN532.
String input;
String pendingBody;
String bootId;
uint32_t sequence = 0;
unsigned long lastWifiAttempt = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastScanAttempt = 0;
unsigned long pendingSince = 0;
bool wasConnected = false;
bool discardLine = false;

bool validUid(const String& uid) {
  if (uid.length() != 8 && uid.length() != 14 && uid.length() != 20) return false;
  for (unsigned int i = 0; i < uid.length(); i++) {
    char c = uid[i];
    if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F'))) return false;
  }
  return true;
}

int request(const String& path, bool heartbeat, const String& body) {
  WiFiClient client;
  HTTPClient http;
  http.setConnectTimeout(2000);
  http.setTimeout(2000);
  if (!http.begin(client, String(API_BASE) + path)) {
    Serial.println("[HTTP] Could not initialize request");
    return -1;
  }
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  http.addHeader("Content-Type", "application/json");
  int code = heartbeat ? http.PUT("{}") : http.POST(body);
  if (code <= 0) Serial.println("[HTTP] Connection failed; retry scheduled");
  else if (!heartbeat || code != 200) {
    Serial.printf("[HTTP] Status %d\n", code);
    Serial.println(http.getString());
  }
  http.end();
  return code;
}

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      input.toUpperCase();
      if (discardLine || !validUid(input)) Serial.println("[INPUT] Use 8, 14 or 20 hex characters");
      else if (pendingBody.length()) Serial.println("[INPUT] Previous test pending; new input rejected");
      else {
        String eventId = bootId + "-" + String(++sequence);
        pendingBody = "{\"uid\":\"" + input + "\",\"deviceId\":\"" + String(DEVICE_ID) + "\",\"eventId\":\"" + eventId + "\"}";
        pendingSince = millis();
        lastScanAttempt = millis() - 3000;
      }
      input = "";
      discardLine = false;
    } else if (!discardLine) {
      if (input.length() < 20) input += c;
      else discardLine = true;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();
  bootId = String(esp_random(), HEX) + String(esp_random(), HEX);
  Serial.println("[BOOT] Connectivity test; enter A1B2C3D4 with Newline at 115200 baud");
}

void loop() {
  readSerial();
  if (pendingBody.length() && millis() - pendingSince >= 60000) {
    Serial.println("[SCAN] Delivery unconfirmed after 60s; pending test discarded");
    pendingBody = "";
  }
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected != wasConnected) {
    Serial.println(connected ? "[WIFI] Connected" : "[WIFI] Disconnected; reconnecting");
    if (connected) {
      Serial.println(WiFi.localIP());
      lastHeartbeat = millis() - 5000;
    }
    wasConnected = connected;
  }
  if (!connected) {
    if (millis() - lastWifiAttempt >= 10000) {
      lastWifiAttempt = millis();
      Serial.println("[WIFI] Retrying connection");
      WiFi.reconnect();
    }
    delay(10);
    return;
  }
  if (pendingBody.length() && millis() - lastScanAttempt >= 3000) {
    int code = request("/devices/test-scans", false, pendingBody);
    lastScanAttempt = millis();
    if (code == 200 || code == 201) {
      Serial.println("[SCAN] Server acknowledged test");
      pendingBody = "";
    } else if (code >= 400 && code < 500 && code != 408 && code != 429) {
      Serial.println("[SCAN] Request rejected; correct configuration/input before retrying");
      pendingBody = "";
    }
  }
  if (millis() - lastHeartbeat >= 5000) {
    request("/devices/" + String(DEVICE_ID) + "/heartbeat", true, "{}");
    lastHeartbeat = millis();
  }
  delay(10);
}
