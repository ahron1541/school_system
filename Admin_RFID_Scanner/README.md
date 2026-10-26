# Admin Scanner 1 - hardware baseline and network settings


This PlatformIO project was copied from:

```text
C:\Users\Ahron\Documents\PlatformIO\Projects\Admin_RFID_Scanner
```

The source and `platformio.ini` were initially copied without modification. This workspace copy now includes USB backend settings and serial-monitor configuration. The original external project remains unchanged. `.pio` build/dependency caches and generated `.vscode` settings were not copied. PlatformIO generates these when needed.

The other original folder, `admin_scanner`, contains the obsolete OLED/I2C experiment and was deliberately not imported.

## Authority and scope


This import does not modify the existing `firmware/`, backend, frontend, database or Scanner 2. No upload is performed by copying or building this project.

## Current behavior

The imported program initializes the PN532, TFT, LEDs, buzzer and Ethernet; obtains DHCP configuration; reads a card UID; and shows local scan feedback. The user reports these components have passed physical testing.

The firmware now uses authenticated HTTP to capture a card requested by an Admin/Registrar student form. The browser must explicitly accept the card and save the student; scanning alone never changes the student record or creates attendance. Semester validation is not implemented. TFT "Card received" means the browser can review the capture, not that the student has been saved.

`src/network/BackendSettings` saves an IPv4 address, port and separate scanner key in ESP32 Preferences. `AdminScannerClient` performs authenticated capture requests. GPIO assignments and portrait orientation are unchanged; the TFT and scan state flow now represent enrollment. A TCP check alone is not proof of a working RFID API connection.

This is an incremental integration, not a production certification. It includes bounded HTTP bodies, capture expiry, DHCP recovery attempts and duplicate suppression. Network/RFID calls remain synchronous with timeouts. Physically verify shared-SPI behavior, supported UID sizes, reconnects and display feedback before deployment. The upstream PN532 driver and unencrypted LAN transport require further hardening for untrusted deployment.

## Preserved configuration

| Function | GPIO |
| --- | --- |
| NeoPixel DIN (8 LEDs, brightness 30) | 13 |
| PN532 TXD -> ESP32 RX | 16 |
| PN532 RXD <- ESP32 TX | 17 |
| Shared SPI SCK | 18 |
| W5500 MISO | 19 |
| TFT CS | 21 |
| TFT DC | 22 |
| Shared SPI MOSI | 23 |
| Active-low buzzer | 25 |
| W5500 reset | 26 |
| W5500 CS | 27 |
| TFT reset | 32 |

PN532 remains UART/HSU with `Serial2` and `NFC_INTERFACE_HSU`. The ST7789 remains 240 x 320, rotation 0 (portrait). The TFT and W5500 share SPI with separate chip selects. The board remains `esp32dev`, Arduino framework, with 115200 upload and serial-monitor speeds. GPIO0 is never an application feature: its GND jumper is temporary for manual flashing only.

All power and wiring details, including the W5500 5V-only supply rule and common ground, are in the authoritative document. No rewiring is required for this import.

## Open in VS Code

1. Keep the `school_system` folder open.
2. Open the PlatformIO extension's Home page.
3. Choose Open Project and select `D:\Projects\school_system\Admin_RFID_Scanner`.
4. Check that the selected PlatformIO environment belongs to this folder, not the old lowercase `admin_scanner` project.
5. Use Build first. Do not select Upload merely to check that the project was imported.

Alternatively, use Terminal > New Terminal in VS Code:

```powershell
cd "D:\Projects\school_system\Admin_RFID_Scanner"
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run
```

Expected successful build: `[SUCCESS]`. The first build may download libraries. The original dependency declarations are intentionally unchanged and are not version-pinned; a later integration step should capture tested versions before updating dependencies.

## Upload only when you intend to flash the board

Follow the full manual-flashing procedure in the authoritative baseline: close Serial Monitor, unplug USB, temporarily connect GPIO0 to GND, reconnect USB, press EN/RESET, then upload. After success, unplug USB, remove the GPIO0-to-GND jumper, reconnect and press EN/RESET before opening Serial Monitor.

From this project directory, the upload and monitor commands are:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run --target upload
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" device monitor --baud 115200
```

If multiple serial devices are connected, confirm the correct ESP32 COM port first. Use `--upload-port COMx` for upload and `--port COMx` for monitoring with the actual port; do not assume a port number.

## Original import verification (2026-09-24, before network settings)

All six imported files and the authoritative hardware document passed SHA-256 copy comparisons. The copied project compiled successfully with PlatformIO; RAM usage was 22,360 bytes (6.8%) and flash usage was 315,317 bytes (24.1%). No firmware was uploaded and no new physical test was performed.

The build resolved Espressif32 7.1.3, PN532-Arduino commit `2c47f5c`, Adafruit GFX 1.12.6, ST7735/ST7789 1.11.0, NeoPixel 1.15.5 and Ethernet 2.0.2. These are the versions observed for this build, not a claim that every dependency exactly matches the previous physical-test build.

## Next integration stage

Upload v0.2 and run the physical enrollment checklist in the current guide. Do not route Admin Scanner 1 into attendance creation, hardcode student records, write profiles to RFID cards, or develop Scanner 2 at this stage. Add semester validation only after enrollment is physically verified.
