#pragma once
#include <Arduino.h>
namespace AdminScannerClient {
void poll(bool networkReady);
bool waiting();
const char *status();
bool submit(const String &uid);
}
