#pragma once
#include <Arduino.h>
#include <IPAddress.h>

namespace BackendSettings {
void begin();
void poll(bool networkReady);
bool destination(IPAddress &ip, uint16_t &port);
const String &key();
}
