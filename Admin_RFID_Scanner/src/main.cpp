#include <Arduino.h>
#include <SPI.h>
#include <Ethernet.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <Adafruit_NeoPixel.h>
#include <PN532_HSU.h>
#include <PN532.h>
#include "network/BackendSettings.h"
#include "network/AdminScannerClient.h"

// Authoritative Scanner 1 wiring: PN532 UART, TFT/W5500 shared SPI.
#define PN532_RX 16
#define PN532_TX 17
#define TFT_CS 21
#define TFT_DC 22
#define TFT_RST 32
#define SPI_SCK 18
#define SPI_MISO 19
#define SPI_MOSI 23
#define BUZZER_PIN 25
#define W5500_RST 26
#define W5500_CS 27
#define NEOPIXEL_PIN 13

PN532_HSU pn532hsu(Serial2, PN532_RX, PN532_TX);
PN532 nfc(pn532hsu);
Adafruit_ST7789 tft(&SPI, TFT_CS, TFT_DC, TFT_RST);
Adafruit_NeoPixel pixels(8, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);
byte scannerMac[] = { 0x02, 0x53, 0x43, 0x41, 0x4E, 0x01 };
bool ethernetReady = false, readerReady = false;
unsigned long lastNetworkAttempt = 0, lastSeen = 0, feedbackUntil = 0, beepUntil = 0;
String lastUID, lastScreen;
const char *networkTitle = "Ethernet offline";
const char *networkDetail = "Check Ethernet cable";

void leds(uint8_t r, uint8_t g, uint8_t b) {
    pixels.fill(pixels.Color(r, g, b)); pixels.show();
}
void beep() { digitalWrite(BUZZER_PIN, LOW); beepUntil = millis() + 80; }
void line(const String &text, int y, uint8_t size, uint16_t color) {
    int16_t x1, y1; uint16_t w, h;
    do {
        tft.setTextSize(size); tft.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
        if (w <= tft.width() - 24 || size == 1) break;
        --size;
    } while (true);
    tft.setTextColor(color); tft.setCursor((tft.width() - w) / 2, y); tft.print(text);
}
void screen(const String &title, const String &detail = "", const String &uid = "", uint16_t color = ST77XX_WHITE) {
    String signature = title + detail + uid + (ethernetReady ? "1" : "0");
    if (signature == lastScreen) return;
    lastScreen = signature;
    tft.fillScreen(ST77XX_BLACK);
    line("ADMIN SCANNER 1", 18, 2, ST77XX_WHITE);
    tft.drawFastHLine(12, 48, tft.width() - 24, 0x632C);
    line(ethernetReady ? "Ethernet connected" : "Ethernet offline", 66, 1, ethernetReady ? ST77XX_GREEN : ST77XX_YELLOW);
    line(title, 114, 2, color);
    if (!uid.isEmpty()) {
        line("CARD UID", 158, 1, 0xBDF7);
        line(uid.substring(0, 14), 181, 2, ST77XX_WHITE);
        if (uid.length() > 14) line(uid.substring(14), 205, 2, ST77XX_WHITE);
    }
    line(detail, 249, 1, 0xBDF7);
    line("Enrollment / v0.4", 294, 1, 0xBDF7);
    Serial.print("[SCANNER] "); Serial.println(title);
}
void network() {
    if (Ethernet.hardwareStatus() == EthernetNoHardware) {
        networkTitle = "W5500 not detected";
        networkDetail = "Check power and SPI wiring";
        ethernetReady = false; return;
    }
    if (Ethernet.linkStatus() != LinkON) {
        networkTitle = "No Ethernet link";
        networkDetail = "Check cable and switch port";
        ethernetReady = false; return;
    }
    if (ethernetReady) {
        int result = Ethernet.maintain();
        if (result == 1 || result == 3) {
            ethernetReady = false;
            networkTitle = "DHCP renewal failed";
            networkDetail = "Check router; retrying";
        }
        return;
    }
    if (millis() - lastNetworkAttempt < 10000) return;
    lastNetworkAttempt = millis();
    screen("Connecting Ethernet", "Requesting DHCP address");
    // Allow the router time for both DHCP offer and acknowledgement.
    ethernetReady = Ethernet.begin(scannerMac, 10000, 2000) != 0;
    lastNetworkAttempt = millis();
    networkTitle = "No DHCP address";
    networkDetail = "Check router LAN / DHCP";
    Serial.println(ethernetReady ? "[NETWORK] DHCP connected" : "[NETWORK] DHCP failed; will retry");
    if (ethernetReady) {
        Serial.print("[NETWORK] Scanner IP: "); Serial.println(Ethernet.localIP());
    }
}
void setup() {
    Serial.begin(115200); delay(1000);
    Serial.println("[FIRMWARE] ADMIN SCANNER 1 / ENROLLMENT v0.4");
    BackendSettings::begin();
    pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, HIGH);
    pixels.begin(); pixels.setBrightness(30); leds(80, 40, 0);
    pinMode(TFT_CS, OUTPUT); pinMode(W5500_CS, OUTPUT);
    digitalWrite(TFT_CS, HIGH); digitalWrite(W5500_CS, HIGH);
    SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI);
    tft.init(240, 320); tft.setRotation(0); tft.setTextWrap(false);
    screen("Starting scanner");
    nfc.begin(); readerReady = nfc.getFirmwareVersion() != 0;
    if (readerReady) { nfc.SAMConfig(); nfc.setPassiveActivationRetries(0x01); }
    Serial.println(readerReady ? "[RFID] PN532 ready" : "[RFID] PN532 unavailable; check wiring and reset");
    pinMode(W5500_RST, OUTPUT); digitalWrite(W5500_RST, LOW); delay(100);
    digitalWrite(W5500_RST, HIGH); delay(500);
    Ethernet.init(W5500_CS);
    Ethernet.begin(scannerMac, IPAddress(0,0,0,0)); delay(300);
    lastNetworkAttempt = millis() - 10000;
    network();
}
void loop() {
    if (beepUntil) {
        if (static_cast<int32_t>(millis() - beepUntil) < 0) { delay(1); return; }
        digitalWrite(BUZZER_PIN, HIGH); beepUntil = 0;
    }
    BackendSettings::poll(ethernetReady);
    network();
    if (feedbackUntil && static_cast<int32_t>(millis() - feedbackUntil) < 0) { delay(2); return; }
    feedbackUntil = 0;
    AdminScannerClient::poll(ethernetReady);
    if (!ethernetReady) {
        leds(70,35,0);
        screen(networkTitle, networkDetail, "", ST77XX_YELLOW);
        delay(20); return;
    }
    if (!readerReady) { leds(90,0,0); screen("Reader unavailable", "Check PN532 wiring; reset"); delay(20); return; }
    const bool waiting = AdminScannerClient::waiting();
    leds(waiting ? 0 : 50, waiting ? 40 : 25, waiting ? 90 : 0);
    screen(AdminScannerClient::status(), waiting ? "Hold one card near the reader" : "Students > Scan card");
    // Upstream copies its byte-sized reported length; validate before using it.
    uint8_t uid[255] = {}, length = 0;
    if (!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &length, 500)) return;
    if (length != 4 && length != 7 && length != 10) { screen("Unsupported card"); feedbackUntil = millis()+1800; return; }
    String value;
    for (uint8_t i = 0; i < length; ++i) { if (uid[i] < 16) value += '0'; value += String(uid[i], HEX); }
    value.toUpperCase();
    const bool repeated = value == lastUID && millis() - lastSeen < 3000;
    lastUID = value; lastSeen = millis();
    if (repeated) return;
    leds(90,45,0); screen("Checking card", "Waiting for backend", value);
    bool received = AdminScannerClient::submit(value);
    if (received) leds(0,90,0); else leds(90,0,0);
    screen(AdminScannerClient::status(), received ? "Review and save in the app" : "Check the admin application", value, received ? ST77XX_GREEN : ST77XX_YELLOW);
    beep(); feedbackUntil = millis() + 2000;
}
