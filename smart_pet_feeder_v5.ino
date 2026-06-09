/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║        IoT-Based Smart Pet Feeder — ESP32 Firmware  v5 (RTC Edition)    ║
 * ║        Shah & Anchor Kutchhi Engineering College, Navi Mumbai            ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  PIN MAP  (matched to your IoT board label)                              ║
 * ║                                                                          ║
 * ║  BOARD LABEL  │ GPIO │ Connected To                                      ║
 * ║  ─────────────┼──────┼───────────────────────────────────────────────── ║
 * ║  D2           │   2  │ RELAY           (already on board, unused here)  ║
 * ║  D4           │   4  │ BUZZER          (already on board)               ║
 * ║  D5           │   5  │ DHT11           (already on board, unused here)  ║
 * ║  D12          │  12  │ LED 1 — Green   (feeding active)                 ║
 * ║  D13          │  13  │ LED 2 — Yellow  (pet detected)                   ║
 * ║  D14          │  14  │ LED 3 — Red     (low food / no food alert)       ║
 * ║  D21          │  21  │ I2C SDA  ← OLED + DS3231 RTC share this line    ║
 * ║  D22          │  22  │ I2C SCL  ← OLED + DS3231 RTC share this line    ║
 * ║  D23          │  23  │ Switch / Digital Sensor (unused here)            ║
 * ║  D25          │  25  │ HC-SR04 TRIG    (already on board)               ║
 * ║  D26          │  26  │ HC-SR04 ECHO    (already on board)               ║
 * ║  D27          │  27  │ SG90 Servo Signal                                ║
 * ║  D32          │  32  │ HX711 DOUT      (load cell data)                 ║
 * ║  D33          │  33  │ HX711 SCK       (load cell clock)                ║
 * ║  D34          │  34  │ Potentiometer   (analog, unused here)            ║
 * ║  D35          │  35  │ LDR             (analog, unused here)            ║
 * ║                                                                          ║
 * ║  DS3231 RTC WIRING:                                                      ║
 * ║    DS3231 VCC  → 3.3V (or 5V — module has onboard regulator)           ║
 * ║    DS3231 GND  → GND                                                    ║
 * ║    DS3231 SDA  → D21  (same wire as OLED SDA)                          ║
 * ║    DS3231 SCL  → D22  (same wire as OLED SCL)                          ║
 * ║    DS3231 SQW  → not connected (unused)                                 ║
 * ║    DS3231 32K  → not connected (unused)                                 ║
 * ║  I2C ADDRESSES (no conflict):                                            ║
 * ║    OLED SSD1306 = 0x3C                                                  ║
 * ║    DS3231 RTC   = 0x68                                                  ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  FEATURES                                                                ║
 * ║  • DS3231 RTC keeps time even after power-off / WiFi failure            ║
 * ║  • On boot: NTP syncs RTC if WiFi connects (best of both worlds)        ║
 * ║  • Servo opens 90° for 5 seconds then returns to 0°                     ║
 * ║  • Ultrasonic detects pet → triggers servo (30 min cooldown)            ║
 * ║  • Scheduled feeding at 10:00, 14:00, 17:00, 21:00 IST                 ║
 * ║    — ONLY fires if load cell reads 0g (bowl is empty)                   ║
 * ║  • Remote feed via app button (POST /feed)                               ║
 * ║  • OLED shows real-time clock from RTC (HH:MM:SS + date)               ║
 * ║  • GET /rtcset?h=10&m=30&s=0&d=29&mo=4&y=2026  — set RTC manually     ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  HTTP ENDPOINTS                                                          ║
 * ║    GET  /data   → full JSON snapshot                                     ║
 * ║    POST /feed   → trigger servo immediately (remote / app button)        ║
 * ║    GET  /reset  → clear all counters                                    ║
 * ║    GET  /rtcset?h=&m=&s=&d=&mo=&y= → manually set RTC time             ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  LIBRARIES  (install via Arduino IDE → Manage Libraries)                ║
 * ║    ESP32Servo        by Kevin Harrington                                 ║
 * ║    Adafruit SSD1306  by Adafruit                                         ║
 * ║    Adafruit GFX Library by Adafruit                                      ║
 * ║    RTClib            by Adafruit  ← NEW (search "RTClib Adafruit")      ║
 * ║    ArduinoJson       by Benoit Blanchon  (v6.x)                         ║
 * ║    HX711             by Bogdan Necula                                    ║
 * ║    WiFi, WebServer, time  — built-in with ESP32 core                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <RTClib.h>          // ← NEW: Adafruit RTClib for DS3231
#include <ArduinoJson.h>
#include <HX711.h>
#include <time.h>            // NTP — built-in, only used to sync RTC on boot

// ═══════════════════════════════════════════════════════════
//  ← CHANGE THESE TWO LINES TO YOUR WIFI DETAILS
// ═══════════════════════════════════════════════════════════
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// ═══════════════════════════════════════════════════════════

// ─── NTP (only used once at boot to set the RTC) ──────────────────────────────
#define NTP_SERVER    "pool.ntp.org"
#define TZ_OFFSET_S   19800   // IST = UTC+5:30
#define DST_OFFSET_S  0
// ──────────────────────────────────────────────────────────────────────────────

// ─── Pin definitions (matched to your IoT board) ──────────────────────────────
#define SERVO_PIN      27   // SG90 servo signal
#define TRIG_PIN       25   // HC-SR04 trigger (already on board)
#define ECHO_PIN       26   // HC-SR04 echo    (already on board)
#define LOADCELL_DOUT  32   // HX711 data
#define LOADCELL_SCK   33   // HX711 clock
#define LED_GREEN      12   // LED 1 — feeding active
#define LED_YELLOW     13   // LED 2 — pet detected
#define LED_RED        14   // LED 3 — low food / no food
#define BUZZER_PIN      4   // already on board
// SDA = 21, SCL = 22 are default I2C pins on ESP32 (both OLED & RTC share them)
// ──────────────────────────────────────────────────────────────────────────────

// ─── OLED (I2C address 0x3C) ──────────────────────────────────────────────────
#define SCREEN_W 128
#define SCREEN_H  64
Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);
// ──────────────────────────────────────────────────────────────────────────────

// ─── DS3231 RTC (I2C address 0x68) ────────────────────────────────────────────
RTC_DS3231 rtc;
bool rtcOK = false;

// Local cache updated every second
int  rtcHour = 0, rtcMin = 0, rtcSec = 0;
int  rtcDay  = 1, rtcMonth = 1, rtcYear = 2024;
char timeStr[12];   // "HH:MM:SS"
char dateStr[14];   // "DD/MM/YYYY"
unsigned long lastRtcReadMs = 0;
// ──────────────────────────────────────────────────────────────────────────────

// ─── Web server ───────────────────────────────────────────────────────────────
WebServer server(80);
// ──────────────────────────────────────────────────────────────────────────────

// ─── Servo ────────────────────────────────────────────────────────────────────
Servo feederServo;
const int   SERVO_CLOSED_DEG = 0;
const int   SERVO_OPEN_DEG   = 90;
const int   SERVO_OPEN_MS    = 5000;  // stays open 5 seconds
bool        isDispensing     = false;
// ──────────────────────────────────────────────────────────────────────────────

// ─── Load Cell / HX711 ────────────────────────────────────────────────────────
HX711 scale;
/*
 *  HOW TO CALIBRATE:
 *  1. Set CALIBRATION_FACTOR = 1.0 and upload
 *  2. Open Serial Monitor at 115200
 *  3. Note raw reading with EMPTY bowl  → A
 *  4. Place 100 g object on bowl
 *  5. Note new raw reading              → B
 *  6. CALIBRATION_FACTOR = (B - A) / 100
 *  7. Update and re-upload
 */
const float CALIBRATION_FACTOR = 2280.0f;
const float MAX_WEIGHT_G       = 300.0f;
const float EMPTY_THRESHOLD_G  =   5.0f;   // ≤ this → "empty" for schedule
const float LOW_THRESHOLD_G    =  40.0f;   // < this → low food warning

float        currentWeightG = 0.0f;
bool         bowlEmpty      = true;
bool         lowFood        = false;
bool         lastLowFood    = false;
unsigned long lastWeightMs  = 0;
const unsigned long WEIGHT_INTERVAL_MS = 800;
// ──────────────────────────────────────────────────────────────────────────────

// ─── Ultrasonic ───────────────────────────────────────────────────────────────
const float          DETECT_CM          = 20.0f;
const unsigned long  SENSOR_POLL_MS     = 500;
const unsigned long  SENSOR_COOLDOWN_MS = 30UL * 60 * 1000;  // 30 minutes
// For quick testing swap to: const unsigned long SENSOR_COOLDOWN_MS = 3UL * 60 * 1000;

unsigned long lastSensorMs   = 0;
unsigned long lastTriggerMs  = 0;
float         distanceCm     = 999.0f;
bool          petPresent     = false;
bool          lastPetPresent = false;
// ──────────────────────────────────────────────────────────────────────────────

// ─── Scheduled feeding times (IST) ───────────────────────────────────────────
struct FeedTime { int hour; int minute; };
const FeedTime SCHEDULE[] = {
  {10,  0},   // 10:00 AM
  {14,  0},   // 02:00 PM
  {17,  0},   // 05:00 PM
  {21,  0},   // 09:00 PM
};
const int SCHEDULE_COUNT = 4;

bool scheduleFired[SCHEDULE_COUNT] = {false, false, false, false};
int  lastCheckedDay = -1;
// ──────────────────────────────────────────────────────────────────────────────

// ─── Stats / log ──────────────────────────────────────────────────────────────
int totalFeedings     = 0;
int totalInteractions = 0;

struct FeedEvent { char timeStr[10]; char trigger[12]; };
FeedEvent feedLog[20];
int       feedLogCount = 0;

int hourlyVisits[24] = {0};
// ──────────────────────────────────────────────────────────────────────────────

// ─── Serial helpers ───────────────────────────────────────────────────────────
void sep()  { Serial.println(F("------------------------------------------------------------")); }
void sep2() { Serial.println(F("============================================================")); }
// ──────────────────────────────────────────────────────────────────────────────

// ─── Read RTC into cache (call once per second) ───────────────────────────────
void updateRtcCache() {
  if (millis() - lastRtcReadMs < 1000) return;
  lastRtcReadMs = millis();

  if (!rtcOK) {
    // Fallback: try NTP time stored in system time (set during boot)
    struct tm t;
    time_t now = time(nullptr);
    localtime_r(&now, &t);
    rtcHour  = t.tm_hour;
    rtcMin   = t.tm_min;
    rtcSec   = t.tm_sec;
    rtcDay   = t.tm_mday;
    rtcMonth = t.tm_mon + 1;
    rtcYear  = t.tm_year + 1900;
  } else {
    DateTime now = rtc.now();
    rtcHour  = now.hour();
    rtcMin   = now.minute();
    rtcSec   = now.second();
    rtcDay   = now.day();
    rtcMonth = now.month();
    rtcYear  = now.year();
  }

  snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d", rtcHour, rtcMin, rtcSec);
  snprintf(dateStr, sizeof(dateStr), "%02d/%02d/%04d", rtcDay, rtcMonth, rtcYear);
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Ultrasonic distance ──────────────────────────────────────────────────────
float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000);
  return (dur == 0) ? 999.0f : dur * 0.0343f / 2.0f;
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Push feed event to circular log ─────────────────────────────────────────
void pushFeedLog(const char* trigger) {
  if (feedLogCount < 20) {
    strncpy(feedLog[feedLogCount].timeStr, timeStr, 9);
    strncpy(feedLog[feedLogCount].trigger, trigger, 11);
    feedLogCount++;
  } else {
    for (int i = 0; i < 19; i++) feedLog[i] = feedLog[i + 1];
    strncpy(feedLog[19].timeStr, timeStr, 9);
    strncpy(feedLog[19].trigger, trigger, 11);
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── CORE: open servo 90°, hold 5 s, close to 0° ────────────────────────────
void openAndClose(const char* trigger) {
  if (isDispensing) {
    Serial.println(F("[SERVO] Already dispensing — ignoring"));
    return;
  }
  isDispensing = true;

  Serial.printf("[SERVO] Opening 90° — trigger=%s | weight=%.1fg\n",
                trigger, currentWeightG);

  digitalWrite(LED_GREEN, HIGH);
  feederServo.write(SERVO_OPEN_DEG);
  tone(BUZZER_PIN, 1000, 200);

  // Non-blocking 5-second wait — HTTP still served
  unsigned long openedAt = millis();
  while (millis() - openedAt < (unsigned long)SERVO_OPEN_MS) {
    server.handleClient();
    updateRtcCache();   // keep time fresh during dispense
    delay(10);
  }

  feederServo.write(SERVO_CLOSED_DEG);
  digitalWrite(LED_GREEN, LOW);
  tone(BUZZER_PIN, 800, 150); delay(200);
  tone(BUZZER_PIN, 600, 150);

  totalFeedings++;
  pushFeedLog(trigger);

  Serial.printf("[SERVO] Closed. Total feeds: %d\n", totalFeedings);
  isDispensing = false;
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Load cell read ───────────────────────────────────────────────────────────
void readWeight() {
  if (!scale.is_ready()) return;

  float raw = scale.get_units(3);
  currentWeightG = raw / CALIBRATION_FACTOR;
  if (currentWeightG < 0.0f) currentWeightG = 0.0f;
  if (currentWeightG > MAX_WEIGHT_G) currentWeightG = MAX_WEIGHT_G;

  bowlEmpty = (currentWeightG <= EMPTY_THRESHOLD_G);
  lowFood   = (currentWeightG < LOW_THRESHOLD_G);

  if (lowFood && !lastLowFood) {
    Serial.printf("[WEIGHT] LOW FOOD: %.1fg remaining\n", currentWeightG);
    tone(BUZZER_PIN, 440, 150); delay(200);
    tone(BUZZER_PIN, 440, 150);
  }
  lastLowFood = lowFood;
  digitalWrite(LED_RED, lowFood ? HIGH : LOW);
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Ultrasonic pet detection (30-min cooldown) ───────────────────────────────
void checkUltrasonic() {
  unsigned long now = millis();
  if (now - lastSensorMs < SENSOR_POLL_MS) return;
  lastSensorMs = now;

  distanceCm = readDistanceCm();
  petPresent = (distanceCm < DETECT_CM);
  digitalWrite(LED_YELLOW, petPresent ? HIGH : LOW);

  if (petPresent && !lastPetPresent) {
    totalInteractions++;
    if (rtcHour >= 0 && rtcHour < 24) hourlyVisits[rtcHour]++;

    Serial.printf("[SENSOR] Pet at %.1fcm | interaction #%d\n",
                  distanceCm, totalInteractions);

    bool cooldownClear = (lastTriggerMs == 0) ||
                         ((now - lastTriggerMs) >= SENSOR_COOLDOWN_MS);

    if (cooldownClear) {
      lastTriggerMs = now;
      Serial.println(F("[SENSOR] Cooldown clear — opening servo"));
      openAndClose("sensor");
    } else {
      unsigned long remaining = SENSOR_COOLDOWN_MS - (now - lastTriggerMs);
      Serial.printf("[SENSOR] Cooldown: %.1f min left\n", remaining / 60000.0f);
    }
  }
  lastPetPresent = petPresent;
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Scheduled feeding (checks every loop, minute-level) ──────────────────────
void checkSchedule() {
  // Reset fired flags at midnight
  if (rtcDay != lastCheckedDay) {
    lastCheckedDay = rtcDay;
    for (int i = 0; i < SCHEDULE_COUNT; i++) scheduleFired[i] = false;
    Serial.println(F("[SCHED] New day — schedule reset"));
  }

  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    if (scheduleFired[i]) continue;
    if (rtcHour == SCHEDULE[i].hour && rtcMin == SCHEDULE[i].minute) {
      scheduleFired[i] = true;

      Serial.printf("[SCHED] Hit %02d:%02d | empty=%s | weight=%.1fg\n",
                    SCHEDULE[i].hour, SCHEDULE[i].minute,
                    bowlEmpty ? "YES" : "NO", currentWeightG);

      if (bowlEmpty) {
        Serial.println(F("[SCHED] Bowl empty → opening servo"));
        openAndClose("schedule");
      } else {
        Serial.printf("[SCHED] Bowl has %.1fg — skipping\n", currentWeightG);
      }
    }
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── OLED update (1 Hz) ───────────────────────────────────────────────────────
unsigned long lastDisplayMs = 0;

void updateDisplay() {
  if (millis() - lastDisplayMs < 1000) return;
  lastDisplayMs = millis();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Row 0: title bar
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(rtcOK ? F("PET FEEDER v5 [RTC]") : F("PET FEEDER v5 [NTP]"));
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // Row 1: large HH:MM clock from RTC
  display.setTextSize(2);
  display.setCursor(14, 13);
  // Print HH:MM
  char hhmm[6];
  snprintf(hhmm, sizeof(hhmm), "%02d:%02d", rtcHour, rtcMin);
  display.print(hhmm);

  // Row 2: date + seconds
  display.setTextSize(1);
  display.setCursor(0, 32);
  display.print(dateStr);
  display.setCursor(90, 32);
  display.print(":");
  char ssStr[3];
  snprintf(ssStr, sizeof(ssStr), "%02d", rtcSec);
  display.print(ssStr);

  // Row 3: distance + weight
  display.setCursor(0, 43);
  char row3[22];
  snprintf(row3, sizeof(row3), "Dist:%.0fcm Wt:%.0fg",
           distanceCm > 400 ? 0 : distanceCm, currentWeightG);
  display.print(row3);

  // Row 4: status
  display.setCursor(0, 54);
  if (isDispensing) {
    display.print(F(">> DISPENSING..."));
  } else if (bowlEmpty) {
    display.print(F("!! BOWL EMPTY !!"));
  } else if (lowFood) {
    display.print(F("! LOW FOOD  Fd:"));
    display.print(totalFeedings);
  } else if (petPresent) {
    display.print(F("PET HERE  Fd:"));
    display.print(totalFeedings);
  } else {
    display.print(F("OK Vis:"));
    display.print(totalInteractions);
    display.print(F(" Fd:"));
    display.print(totalFeedings);
  }

  display.display();
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Serial live readings (every 2 s) ────────────────────────────────────────
unsigned long lastSerialMs = 0;

void printLiveReadings() {
  if (millis() - lastSerialMs < 2000) return;
  lastSerialMs = millis();

  unsigned long cooldownRem = 0;
  if (lastTriggerMs > 0) {
    unsigned long el = millis() - lastTriggerMs;
    cooldownRem = (el < SENSOR_COOLDOWN_MS) ? (SENSOR_COOLDOWN_MS - el) / 1000 : 0;
  }

  Serial.printf("[LIVE] %s | %.1fcm | %.1fg | Pet:%s | Empty:%s | Feeds:%d | Cooldown:%lus\n",
    timeStr, distanceCm, currentWeightG,
    petPresent ? "Y" : "n",
    bowlEmpty  ? "Y" : "n",
    totalFeedings, cooldownRem);
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── CORS helper ──────────────────────────────────────────────────────────────
void addCORS() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── HTTP: GET /data ──────────────────────────────────────────────────────────
void handleData() {
  addCORS();
  StaticJsonDocument<2048> doc;

  doc["time"]              = timeStr;
  doc["date"]              = dateStr;
  doc["rtcOK"]             = rtcOK;
  doc["petPresent"]        = petPresent;
  doc["distanceCm"]        = (int)distanceCm;
  doc["weightG"]           = round(currentWeightG * 10.0f) / 10.0f;
  doc["maxWeightG"]        = MAX_WEIGHT_G;
  doc["foodLevelPct"]      = (int)((currentWeightG / MAX_WEIGHT_G) * 100.0f);
  doc["bowlEmpty"]         = bowlEmpty;
  doc["lowFoodAlert"]      = lowFood;
  doc["totalFeedings"]     = totalFeedings;
  doc["totalInteractions"] = totalInteractions;
  doc["isDispensing"]      = isDispensing;

  unsigned long cooldownRem = 0;
  if (lastTriggerMs > 0) {
    unsigned long el = millis() - lastTriggerMs;
    cooldownRem = (el < SENSOR_COOLDOWN_MS) ? (SENSOR_COOLDOWN_MS - el) : 0;
  }
  doc["sensorCooldownRemMs"]   = cooldownRem;
  doc["sensorCooldownTotalMs"] = (unsigned long)SENSOR_COOLDOWN_MS;

  JsonArray sched = doc.createNestedArray("schedule");
  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    JsonObject s = sched.createNestedObject();
    char tstr[8];
    snprintf(tstr, sizeof(tstr), "%02d:%02d", SCHEDULE[i].hour, SCHEDULE[i].minute);
    s["time"]  = tstr;
    s["fired"] = scheduleFired[i];
    int slotMins = SCHEDULE[i].hour * 60 + SCHEDULE[i].minute;
    int nowMins  = rtcHour * 60 + rtcMin;
    int diff     = slotMins - nowMins;
    if (diff < 0) diff += 1440;
    s["minsUntil"] = scheduleFired[i] ? -1 : diff;
  }

  JsonArray hourly = doc.createNestedArray("hourlyVisits");
  for (int i = 0; i < 24; i++) hourly.add(hourlyVisits[i]);

  JsonArray feeds = doc.createNestedArray("feedings");
  for (int i = feedLogCount - 1; i >= max(0, feedLogCount - 10); i--) {
    JsonObject obj = feeds.createNestedObject();
    obj["time"]    = feedLog[i].timeStr;
    obj["trigger"] = feedLog[i].trigger;
  }

  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── HTTP: POST /feed  (remote manual button) ────────────────────────────────
void handleFeed() {
  addCORS();
  Serial.println(F("[HTTP] Remote feed triggered from app"));
  openAndClose("remote");
  server.send(200, "application/json",
    "{\"status\":\"ok\",\"message\":\"Servo opened for 5 seconds\"}");
}

// ─── HTTP: GET /reset ────────────────────────────────────────────────────────
void handleReset() {
  addCORS();
  totalFeedings     = 0;
  totalInteractions = 0;
  feedLogCount      = 0;
  lastTriggerMs     = 0;
  memset(hourlyVisits, 0, sizeof(hourlyVisits));
  for (int i = 0; i < SCHEDULE_COUNT; i++) scheduleFired[i] = false;
  Serial.println(F("[HTTP] Counters reset"));
  server.send(200, "application/json",
    "{\"status\":\"ok\",\"message\":\"Counters reset\"}");
}

// ─── HTTP: GET /rtcset?h=HH&m=MM&s=SS&d=DD&mo=MM&y=YYYY ─────────────────────
// Use this if you need to manually set the RTC without WiFi / NTP
// Example: http://192.168.1.100/rtcset?h=10&m=30&s=0&d=29&mo=4&y=2026
void handleRtcSet() {
  addCORS();
  if (!rtcOK) {
    server.send(503, "application/json",
      "{\"status\":\"error\",\"message\":\"RTC not found\"}");
    return;
  }
  int h  = server.hasArg("h")  ? server.arg("h").toInt()  : rtcHour;
  int m  = server.hasArg("m")  ? server.arg("m").toInt()  : rtcMin;
  int s  = server.hasArg("s")  ? server.arg("s").toInt()  : rtcSec;
  int d  = server.hasArg("d")  ? server.arg("d").toInt()  : rtcDay;
  int mo = server.hasArg("mo") ? server.arg("mo").toInt() : rtcMonth;
  int y  = server.hasArg("y")  ? server.arg("y").toInt()  : rtcYear;

  rtc.adjust(DateTime(y, mo, d, h, m, s));
  Serial.printf("[RTC] Manually set to %04d-%02d-%02d %02d:%02d:%02d\n",
                y, mo, d, h, m, s);
  server.send(200, "application/json",
    "{\"status\":\"ok\",\"message\":\"RTC time updated\"}");
}

void handleOptions() { addCORS(); server.send(204); }
// ──────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(1200);

  sep2();
  Serial.println(F("   IoT Smart Pet Feeder v5  (DS3231 RTC Edition)"));
  Serial.println(F("   Shah & Anchor Kutchhi Engineering College"));
  sep2();

  // ── 1. GPIO ────────────────────────────────────────────────────────────────
  Serial.println(F("[1/8] GPIO pins..."));
  pinMode(TRIG_PIN,   OUTPUT);
  pinMode(ECHO_PIN,   INPUT);
  pinMode(LED_GREEN,  OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED,    OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  Serial.println(F("      OK"));

  // ── 2. Servo ───────────────────────────────────────────────────────────────
  Serial.println(F("[2/8] Servo GPIO27..."));
  feederServo.attach(SERVO_PIN);
  feederServo.write(SERVO_CLOSED_DEG);
  Serial.println(F("      CLOSED (0°) — OK"));

  // ── 3. I2C + OLED ─────────────────────────────────────────────────────────
  Serial.println(F("[3/8] I2C bus + OLED (SDA=21 SCL=22)..."));
  Wire.begin(21, 22);
  bool oledOK = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (!oledOK) oledOK = display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  if (oledOK) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(4, 20); display.println(F("Smart Pet Feeder v5"));
    display.setCursor(4, 32); display.println(F("Booting..."));
    display.display();
    Serial.println(F("      OLED OK"));
  } else {
    Serial.println(F("      OLED NOT FOUND — continuing"));
  }

  // ── 4. DS3231 RTC ─────────────────────────────────────────────────────────
  Serial.println(F("[4/8] DS3231 RTC (I2C 0x68, SDA=21 SCL=22)..."));
  if (rtc.begin()) {
    rtcOK = true;
    if (rtc.lostPower()) {
      Serial.println(F("      RTC lost power — time may be wrong. Will sync from NTP if WiFi connects."));
    }
    DateTime now = rtc.now();
    Serial.printf("      RTC OK — current time: %04d-%02d-%02d %02d:%02d:%02d\n",
                  now.year(), now.month(), now.day(),
                  now.hour(), now.minute(), now.second());
  } else {
    Serial.println(F("      DS3231 NOT FOUND — check SDA/SCL wiring on D21/D22"));
    Serial.println(F("      Falling back to NTP time"));
  }

  // ── 5. HX711 Load Cell ────────────────────────────────────────────────────
  Serial.println(F("[5/8] HX711 (DOUT=GPIO32 SCK=GPIO33)..."));
  scale.begin(LOADCELL_DOUT, LOADCELL_SCK);
  delay(600);
  if (scale.is_ready()) {
    scale.tare();
    Serial.println(F("      HX711 tared — OK"));
  } else {
    Serial.println(F("      HX711 NOT FOUND — check GPIO32/33 wiring"));
  }

  // ── 6. WiFi ────────────────────────────────────────────────────────────────
  Serial.printf("[6/8] WiFi → %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int att = 0;
  while (WiFi.status() != WL_CONNECTED && att < 40) {
    delay(500); Serial.print("."); att++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("      CONNECTED | IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println(F("      TIMEOUT — running offline. RTC provides time."));
  }

  // ── 7. NTP sync → write to RTC ────────────────────────────────────────────
  Serial.println(F("[7/8] NTP sync (IST UTC+5:30)..."));
  if (WiFi.status() == WL_CONNECTED) {
    configTime(TZ_OFFSET_S, DST_OFFSET_S, NTP_SERVER);
    int ntpAtt = 0;
    while (time(nullptr) < 1000000000UL && ntpAtt < 20) {
      delay(500); Serial.print("."); ntpAtt++;
    }
    Serial.println();
    if (time(nullptr) > 1000000000UL) {
      // Push NTP time into RTC
      if (rtcOK) {
        struct tm t;
        time_t now = time(nullptr);
        localtime_r(&now, &t);
        rtc.adjust(DateTime(
          t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
          t.tm_hour, t.tm_min, t.tm_sec));
        Serial.println(F("      NTP synced → RTC updated"));
      } else {
        Serial.println(F("      NTP synced (RTC absent — using system time)"));
      }
    } else {
      Serial.println(F("      NTP FAILED — RTC holds last known time"));
    }
  } else {
    Serial.println(F("      Skipped (no WiFi)"));
  }

  // ── 8. HTTP server ────────────────────────────────────────────────────────
  Serial.println(F("[8/8] HTTP server..."));
  server.on("/data",   HTTP_GET,     handleData);
  server.on("/feed",   HTTP_POST,    handleFeed);
  server.on("/feed",   HTTP_OPTIONS, handleOptions);
  server.on("/reset",  HTTP_GET,     handleReset);
  server.on("/rtcset", HTTP_GET,     handleRtcSet);
  server.begin();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("      Dashboard: http://%s\n", WiFi.localIP().toString().c_str());
    Serial.printf("      Set RTC:   http://%s/rtcset?h=10&m=0&s=0&d=29&mo=4&y=2026\n",
                  WiFi.localIP().toString().c_str());
  }

  // Boot chime
  tone(BUZZER_PIN, 700, 120); delay(160);
  tone(BUZZER_PIN, 900, 120); delay(160);
  tone(BUZZER_PIN, 1100, 200);

  sep();
  Serial.println(F("  READY — Schedule: 10:00 | 14:00 | 17:00 | 21:00 IST"));
  Serial.println(F("  Servo fires at schedule ONLY if bowl empty (<=5g)"));
  Serial.println(F("  Ultrasonic trigger: 30 min cooldown"));
  Serial.println(F("  RTC (DS3231) on I2C shared bus with OLED"));
  sep();
  Serial.println(F("  TIME     | DIST  | WEIGHT | PET | EMPTY | FEEDS | COOLDOWN"));
  sep();
}

void loop() {
  server.handleClient();

  // Read RTC every second into cache
  updateRtcCache();

  // Weight (every 800 ms)
  if (millis() - lastWeightMs >= WEIGHT_INTERVAL_MS) {
    lastWeightMs = millis();
    readWeight();
  }

  // Ultrasonic + 30-min cooldown
  checkUltrasonic();

  // Scheduled feeding check
  checkSchedule();

  // OLED display
  updateDisplay();

  // Serial debug
  printLiveReadings();
}
