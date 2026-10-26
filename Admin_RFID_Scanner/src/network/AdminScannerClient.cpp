#include "AdminScannerClient.h"
#include "BackendSettings.h"
#include <Ethernet.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>

namespace {
String captureId;
const char *message = "Starting";
unsigned long lastPoll = 0;
int request(const char *path, const String &body, JsonDocument &response) {
    IPAddress ip; uint16_t port;
    if (!BackendSettings::destination(ip, port) || BackendSettings::key().isEmpty()) return -2;
    EthernetClient transport;
    transport.setConnectionTimeout(1500);
    HttpClient http(transport, ip, port);
    http.setHttpResponseTimeout(1800);
    http.setTimeout(1800);
    http.beginRequest();
    int error = body.isEmpty() ? http.get(path) : http.post(path);
    if (error != 0) { http.stop(); return -1; }
    // ArduinoHttpClient's IPAddress constructor omits Host; HTTP/1.1 requires it.
    String host = ip.toString() + ":" + String(port);
    http.sendHeader("Host", host.c_str());
    http.sendHeader("X-Device-Key", BackendSettings::key());
    http.sendHeader("Connection", "close");
    if (!body.isEmpty()) {
        http.sendHeader("Content-Type", "application/json");
        http.sendHeader("Content-Length", body.length());
        http.beginBody(); http.print(body);
    }
    http.endRequest();
    int status = http.responseStatusCode();
    if (status != 200) { http.stop(); return status; }
    long length = http.contentLength();
    if (length < 1 || length > 1024 || http.isResponseChunked()) { http.stop(); return -3; }
    String payload; payload.reserve(length);
    unsigned long started = millis();
    while (payload.length() < static_cast<size_t>(length) && millis() - started < 2000) {
        if (http.available()) { int c = http.read(); if (c >= 0) payload += static_cast<char>(c); }
        else delay(1);
    }
    http.stop();
    if (payload.length() != static_cast<size_t>(length) || deserializeJson(response, payload, DeserializationOption::NestingLimit(5)) || !response["success"].as<bool>()) return -3;
    return status;
}
const char *failure(int code) {
    if (code == -2) return "Configure backend";
    if (code == 401) return "Check scanner key";
    if (code == 400) return "HTTP request rejected";
    if (code == 404) return "Scanner API not found";
    if (code == 410) return "Start a new scan";
    if (code == 409) return "Scan request busy";
    if (code == 429) return "Wait, then retry";
    if (code == -3) return "Invalid API reply";
    return "Backend unavailable";
}
}
void AdminScannerClient::poll(bool ready) {
    if (!ready) { captureId = ""; message = "Ethernet offline"; return; }
    if (millis() - lastPoll < 1500) return;
    lastPoll = millis();
    JsonDocument result;
    int code = request("/api/admin-scanner/device/capture", "", result);
    captureId = "";
    if (code != 200) { message = failure(code); return; }
    const char *id = result["data"]["id"] | "";
    if (strlen(id) == 36) { captureId = id; message = "Tap RFID card"; }
    else message = "Open student form";
}
bool AdminScannerClient::waiting() { return !captureId.isEmpty(); }
const char *AdminScannerClient::status() { return message; }
bool AdminScannerClient::submit(const String &uid) {
    if (captureId.isEmpty()) { message = "Start scan in app"; return false; }
    JsonDocument body, result;
    body["captureId"] = captureId; body["uid"] = uid;
    String text; serializeJson(body, text);
    int code = request("/api/admin-scanner/device/scans", text, result);
    captureId = "";
    if (code != 200) { message = failure(code); return false; }
    const char *state = result["data"]["state"] | "";
    if (!strcmp(state, "captured")) { message = "Card received"; return true; }
    message = !strcmp(state, "conflict") ? "Card already used" : "Invalid API reply";
    return false;
}
