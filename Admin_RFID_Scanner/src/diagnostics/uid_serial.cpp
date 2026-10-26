#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include <PN532_HSU.h>
#include <PN532.h>
#include <cstring>

// Verified Scanner 1 wiring. Do not use with the proposed I2C rewiring.
constexpr uint8_t PN532_RX = 16;
constexpr uint8_t PN532_TX = 17;
constexpr uint8_t TFT_CS = 21;
constexpr uint8_t W5500_CS = 27;
constexpr uint8_t BUZZER_PIN = 25;
constexpr uint8_t NEOPIXEL_PIN = 13;
constexpr unsigned long CHECK_INTERVAL_MS = 5000;
constexpr unsigned long REPEAT_GAP_MS = 2000;

PN532_HSU transport(Serial2, PN532_RX, PN532_TX);
PN532 reader(transport);
Adafruit_NeoPixel pixels(8, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);
bool ready = false;
unsigned long lastCheck = 0;
unsigned long lastSeen = 0;
char previousUid[21] = {};

bool connectReader() {
    reader.begin();
    const uint32_t version = reader.getFirmwareVersion();
    if (!version || !reader.SAMConfig() || !reader.setPassiveActivationRetries(0x01)) {
        Serial.println("[RFID] Reader unavailable. Check HSU mode, GPIO16/17 and common ground. Retrying in 5 seconds.");
        return false;
    }
    previousUid[0] = '\0';
    Serial.printf("[RFID] PN532 ready. Firmware %lu.%lu\n",
                  static_cast<unsigned long>((version >> 16) & 0xFF),
                  static_cast<unsigned long>((version >> 8) & 0xFF));
    Serial.println("[RFID] Tap a 13.56 MHz ISO14443A card. Remove it for 2 seconds before tapping again.");
    return true;
}

void setup() {
    // Keep the attached active-low buzzer silent and both SPI devices deselected.
    digitalWrite(BUZZER_PIN, HIGH); pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(TFT_CS, HIGH); pinMode(TFT_CS, OUTPUT);
    digitalWrite(W5500_CS, HIGH); pinMode(W5500_CS, OUTPUT);
    pixels.begin(); pixels.clear(); pixels.show();
    Serial.begin(115200);
    delay(1000);
    Serial.println("[FIRMWARE] SCANNER 1 / STEP 1 UID TEST / UART GPIO16-17");
    Serial.println("[TEST] Serial output only. TFT/LED feedback, networking and database writes are disabled.");
    ready = connectReader();
    lastCheck = millis();
}

void loop() {
    if (millis() - lastCheck >= CHECK_INTERVAL_MS) {
        if (!ready) ready = connectReader();
        else if (!reader.getFirmwareVersion()) {
            ready = false;
            previousUid[0] = '\0';
            Serial.println("[RFID] Reader connection lost. Check the connection; retrying in 5 seconds.");
        }
        lastCheck = millis();
    }
    if (!ready) { delay(10); return; }

    // The installed driver copies a byte-sized length; allow its full range,
    // then accept only standard UID lengths before formatting any identifier.
    uint8_t bytes[255] = {};
    uint8_t length = 0;
    if (!reader.readPassiveTargetID(PN532_MIFARE_ISO14443A, bytes, &length, 500)) return;
    if (length != 4 && length != 7 && length != 10) {
        Serial.println("[RFID] Unsupported UID length. Scan ignored.");
        return;
    }
    constexpr char hex[] = "0123456789ABCDEF";
    char uid[21] = {};
    for (uint8_t i = 0; i < length; ++i) {
        uid[i * 2] = hex[bytes[i] >> 4];
        uid[i * 2 + 1] = hex[bytes[i] & 0x0F];
    }
    const unsigned long now = millis();
    const bool repeated = strcmp(previousUid, uid) == 0 && now - lastSeen < REPEAT_GAP_MS;
    lastSeen = now;
    if (repeated) return;
    strcpy(previousUid, uid);
    Serial.printf("[RFID] Card detected | UID=%s | bytes=%u\n", uid, static_cast<unsigned>(length));
}
