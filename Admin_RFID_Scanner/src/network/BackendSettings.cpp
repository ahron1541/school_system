#include "BackendSettings.h"
#include <Arduino.h>
#include <Ethernet.h>
#include <Preferences.h>

namespace {
Preferences preferences;
bool storageReady = false;
bool networkReady = false;
String endpoint;
String apiKey;
char input[128] = {};
size_t length = 0;
bool overflow = false;

bool parseEndpoint(const String &value, IPAddress &ip, uint16_t &port) {
    const int colon = value.indexOf(':');
    if (colon < 1 || value.indexOf(':', colon + 1) >= 0) return false;
    const String host = value.substring(0, colon);
    // Accept only a numeric unicast IPv4 address, never URLs or loopback.
    unsigned octets[4] = {};
    unsigned part = 0;
    unsigned digits = 0;
    for (size_t i = 0; i < host.length(); ++i) {
        const char c = host[i];
        if (c == '.') {
            if (!digits || part >= 3) return false;
            ++part; digits = 0;
        } else {
            if (c < '0' || c > '9' || ++digits > 3) return false;
            octets[part] = octets[part] * 10 + (c - '0');
            if (octets[part] > 255) return false;
        }
    }
    if (part != 3 || !digits || octets[0] == 0 || octets[0] == 127 || octets[0] >= 224) return false;
    unsigned number = 0;
    const String portText = value.substring(colon + 1);
    if (portText.isEmpty() || portText.length() > 5) return false;
    for (size_t i = 0; i < portText.length(); ++i) {
        if (portText[i] < '0' || portText[i] > '9') return false;
        number = number * 10 + (portText[i] - '0');
    }
    if (!number || number > 65535) return false;
    ip = IPAddress(octets[0], octets[1], octets[2], octets[3]);
    port = static_cast<uint16_t>(number);
    return true;
}

void show() {
    Serial.print("[CONFIG] Backend: ");
    Serial.println(endpoint.isEmpty() ? "not configured" : endpoint);
    Serial.println(apiKey.isEmpty() ? "[CONFIG] Scanner key: not configured" : "[CONFIG] Scanner key: configured (hidden)");
    Serial.print("[NETWORK] Scanner DHCP address: ");
    if (networkReady) Serial.println(Ethernet.localIP());
    else Serial.println("not ready");
    Serial.println("[CONFIG] Commands: backend set <IPv4>:<port> | backend show | backend check | backend clear | backend key <key>");
}

void check() {
    IPAddress ip;
    uint16_t port;
    if (!parseEndpoint(endpoint, ip, port)) {
        Serial.println("[CONFIG] Set a backend address first."); return;
    }
    if (!networkReady || Ethernet.hardwareStatus() == EthernetNoHardware || Ethernet.linkStatus() != LinkON || Ethernet.localIP() == IPAddress(0,0,0,0)) {
        Serial.println("[NETWORK] No ready DHCP connection. Connect Ethernet and reset the scanner."); return;
    }
    EthernetClient client;
    client.setConnectionTimeout(2000);
    Serial.println("[NETWORK] Checking the configured TCP port...");
    const bool connected = client.connect(ip, port) == 1;
    client.stop();
    Serial.println(connected ? "[NETWORK] TCP port reachable. API, authentication and RFID integration are NOT verified by this check." : "[NETWORK] TCP connection failed. Check backend LAN mode, address, port, firewall and network isolation.");
}

void execute(const String &command) {
    if (command.startsWith("backend key ")) {
        String candidate = command.substring(12); candidate.trim();
        bool valid = candidate.length() == 64;
        for (size_t i = 0; i < candidate.length(); ++i) valid = valid && ((candidate[i] >= '0' && candidate[i] <= '9') || (candidate[i] >= 'a' && candidate[i] <= 'f'));
        if (!valid) { Serial.println("[CONFIG] Invalid key. Expected 64 lowercase hexadecimal characters."); return; }
        if (!storageReady || preferences.putString("key", candidate) != candidate.length()) { Serial.println("[CONFIG] Could not save key."); return; }
        apiKey = candidate;
        Serial.println("[CONFIG] Scanner key saved (hidden)."); return;
    }
    if (command == "backend show" || command == "help") { show(); return; }
    if (command == "backend check") { check(); return; }
    if (command == "backend clear") {
        if (!storageReady || (preferences.isKey("endpoint") && !preferences.remove("endpoint"))) {
            Serial.println("[CONFIG] Could not clear saved settings."); return;
        }
        endpoint = "";
        Serial.println("[CONFIG] Backend address cleared."); return;
    }
    if (command.startsWith("backend set ")) {
        String candidate = command.substring(12); candidate.trim();
        IPAddress ip; uint16_t port;
        if (!parseEndpoint(candidate, ip, port)) {
            Serial.println("[CONFIG] Invalid address. Use backend set <IPv4>:<port>; no http://, path or loopback."); return;
        }
        candidate = ip.toString() + ":" + String(port);
        if (!storageReady) { Serial.println("[CONFIG] Settings storage unavailable; nothing saved."); return; }
        if (candidate == endpoint) { Serial.println("[CONFIG] Address already saved."); return; }
        // Store host and port together so an interrupted write cannot mix settings.
        if (preferences.putString("endpoint", candidate) != candidate.length()) {
            Serial.println("[CONFIG] Save failed; previous in-memory address retained."); return;
        }
        endpoint = candidate;
        Serial.print("[CONFIG] Saved backend address: "); Serial.println(endpoint);
        Serial.println("[CONFIG] No restart required. Run backend check to test TCP reachability.");
        return;
    }
    Serial.println("[CONFIG] Unknown command. Type help.");
}
}

void BackendSettings::begin() {
    storageReady = preferences.begin("admin-net", false);
    if (storageReady) {
        apiKey = preferences.getString("key", "");
        endpoint = preferences.getString("endpoint", "");
        IPAddress ip; uint16_t port;
        if (!endpoint.isEmpty() && !parseEndpoint(endpoint, ip, port)) {
            endpoint = ""; Serial.println("[CONFIG] Saved endpoint invalid; configure it again.");
        }
    } else Serial.println("[CONFIG] Could not open persistent settings.");
    show();
}

bool BackendSettings::destination(IPAddress &ip, uint16_t &port) { return parseEndpoint(endpoint, ip, port); }
const String &BackendSettings::key() { return apiKey; }

void BackendSettings::poll(bool ready) {
    networkReady = ready;
    // Bounded input; a long or malformed line is rejected in full.
    unsigned budget = 160;
    while (Serial.available() && budget--) {
        const char c = static_cast<char>(Serial.read());
        if (c == '\r' || c == '\n') {
            if (overflow) Serial.println("[CONFIG] Command too long or invalid; ignored.");
            else if (length) { input[length] = '\0'; String command(input); command.trim(); execute(command); }
            length = 0; overflow = false;
        } else if (c == '\b' || c == 127) {
            if (length && !overflow) --length;
        } else if (c < 32 || c > 126 || length >= sizeof(input)-1) overflow = true;
        else if (!overflow) input[length++] = c;
    }
}
