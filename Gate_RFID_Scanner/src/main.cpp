#include <Arduino.h>
#include <SPI.h>
#include <Ethernet.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <Adafruit_NeoPixel.h>
#include <PN532_HSU.h>
#include <PN532.h>
#include <mbedtls/md.h>
#include <esp_system.h>
#include <time.h>

constexpr uint8_t NEOPIXEL_PIN=13, PN532_RX=16, PN532_TX=17, SPI_SCK=18, SPI_MISO=19;
constexpr uint8_t TFT_CS=21, TFT_DC=22, SPI_MOSI=23, BUZZER_PIN=25, W5500_RST=26, W5500_CS=27, TFT_RST=32;
constexpr uint8_t TFT_ROTATION=1; // Also supports rotation 3 without changing layout.
constexpr size_t QUEUE_CAPACITY=8;
constexpr uint32_t SAME_CARD_COOLDOWN_MS=5000, REQUEST_TIMEOUT_MS=3000;
enum class State {STARTING, NETWORK_CONNECTING, READY, PROCESSING, RESULT, NETWORK_OFFLINE, SERVICE_UNAVAILABLE};
enum class Request {NONE, TIME, SCAN, HEARTBEAT};
struct Event {String id,uid,occurredAt;};
Event pending[QUEUE_CAPACITY]; size_t pendingCount=0;
Preferences settings;
Adafruit_ST7789 tft(TFT_CS,TFT_DC,TFT_RST);
Adafruit_NeoPixel pixels(8,NEOPIXEL_PIN,NEO_GRB+NEO_KHZ800);
PN532_HSU uart(Serial2); PN532 reader(uart);
EthernetClient transport;
byte mac[]={0x02,0x53,0x43,0x41,0x4E,0x02};
IPAddress backend;
IPAddress staticIp,staticGateway,staticMask;
bool staticNetwork=false;
String host,key,deviceId,serialLine,lastVisible,resultText,lastUid;
uint16_t port=4000;
State state=State::STARTING; Request request=Request::NONE;
String response,requestStamp,requestSignature,nonce;
uint32_t requestStarted=0,retryAt=0,networkAt=0,heartbeatAt=0,readAt=0,beepUntil=0,resultUntil=0,lastSeen=0,lastAccepted=0;
uint32_t previousMillis=0; uint64_t uptime=0,serverBase=0,clockUptime=0;
bool clockReady=false,networkReady=false,readerReady=false,serviceReady=false,storageFault=false;
int lastLink=-1;
uint32_t linkDrops=0,requestFailures=0;
String lastNetworkError="none";

uint32_t updateTime(){uint32_t now=millis();uptime+=uint32_t(now-previousMillis);previousMillis=now;return now;}
void stopBeep(uint32_t now){if(beepUntil&&static_cast<int32_t>(now-beepUntil)>=0){digitalWrite(BUZZER_PIN,HIGH);beepUntil=0;}}
void networkReport(){
  digitalWrite(TFT_CS,HIGH);
  Serial.printf("[NETWORK] Hardware=%d (3=W5500) Link=%d (1=ON,2=OFF,0=UNKNOWN) Mode=%s Address=%s\n",int(Ethernet.hardwareStatus()),int(Ethernet.linkStatus()),staticNetwork?"STATIC":"DHCP",networkReady?"ready":"not ready");
  Serial.print("[NETWORK] Scanner IP: ");Serial.println(Ethernet.localIP());
  Serial.print("[NETWORK] Gateway: ");Serial.println(Ethernet.gatewayIP());
  Serial.printf("[NETWORK] Link drops=%lu Request failures=%lu Last=%s Pending=%u Free heap=%u\n",static_cast<unsigned long>(linkDrops),static_cast<unsigned long>(requestFailures),lastNetworkError.c_str(),unsigned(pendingCount),unsigned(ESP.getFreeHeap()));
}

String number(uint64_t value) {char buffer[24];snprintf(buffer,sizeof(buffer),"%llu",static_cast<unsigned long long>(value));return String(buffer);}
String hmac(const String &text) {
  unsigned char out[32]; char hex[65];
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),reinterpret_cast<const unsigned char*>(key.c_str()),key.length(),reinterpret_cast<const unsigned char*>(text.c_str()),text.length(),out);
  for(int i=0;i<32;i++) snprintf(hex+i*2,3,"%02x",out[i]); return String(hex);
}
String eventId(){char out[33];for(int i=0;i<4;i++)snprintf(out+i*8,9,"%08lx",static_cast<unsigned long>(esp_random()));return String(out);}
uint64_t serverNow(){return serverBase+(uptime-clockUptime);}
String isoTime(){if(!clockReady)return "";uint64_t ms=serverNow();time_t seconds=ms/1000;struct tm parts;gmtime_r(&seconds,&parts);char out[30];strftime(out,sizeof(out),"%Y-%m-%dT%H:%M:%S",&parts);return String(out)+"."+(ms%1000<100?"0":"")+(ms%1000<10?"0":"")+String(static_cast<unsigned long>(ms%1000))+"Z";}
bool due(uint32_t now,uint32_t target){return static_cast<int32_t>(now-target)>=0;}
uint32_t ipv4Number(const IPAddress &ip){return (uint32_t(ip[0])<<24)|(uint32_t(ip[1])<<16)|(uint32_t(ip[2])<<8)|ip[3];}
bool parseStatic(const String &value,IPAddress &ip,IPAddress &gateway,IPAddress &mask){
  int first=value.indexOf(' '),second=value.indexOf(' ',first+1);
  if(first<1||second<=first+1||value.indexOf(' ',second+1)>=0)return false;
  if(!ip.fromString(value.substring(0,first))||!gateway.fromString(value.substring(first+1,second))||!mask.fromString(value.substring(second+1)))return false;
  uint32_t address=ipv4Number(ip),router=ipv4Number(gateway),netmask=ipv4Number(mask),hosts=~netmask;
  if(netmask==0||hosts<3||(hosts&(hosts+1))!=0)return false;
  if(ip[0]==0||ip[0]==127||ip[0]>=224||gateway[0]==0||gateway[0]==127||gateway[0]>=224)return false;
  return address!=router&&(address&netmask)==(router&netmask)&&(address&hosts)!=0&&(address&hosts)!=hosts&&(router&hosts)!=0&&(router&hosts)!=hosts;
}
void restartNetwork(){
  transport.stop();request=Request::NONE;networkReady=false;serviceReady=false;clockReady=false;
  networkAt=0;retryAt=0;heartbeatAt=0;
  // Keep queued events and their original IDs/timestamps across reconfiguration.
}
bool readCard(uint8_t *uid,uint8_t &length){
  // Validate the PN532 frame before copying; the upstream convenience API trusts its UID length.
  uint8_t command[]={PN532_COMMAND_INLISTPASSIVETARGET,1,PN532_MIFARE_ISO14443A},buffer[64];
  if(uart.writeCommand(command,sizeof(command)))return false;
  int16_t received=uart.readResponse(buffer,sizeof(buffer),30);
  if(received<6||buffer[0]!=1)return false;
  length=buffer[5];if((length!=4&&length!=7&&length!=10)||received<6+length)return false;
  memcpy(uid,buffer+6,length);return true;
}
void beep(uint32_t now,uint32_t duration){digitalWrite(BUZZER_PIN,LOW);beepUntil=now+duration;}
void light(uint8_t r,uint8_t g,uint8_t b){static uint32_t previous=0xFFFFFFFF;uint32_t color=pixels.Color(r,g,b);if(color==previous)return;previous=color;pixels.fill(color);pixels.show();}
void textLine(const String &text,int y,uint8_t size,uint16_t color){tft.setTextSize(size);tft.setTextColor(color);int16_t x1,y1;uint16_t w,h;tft.getTextBounds(text,0,0,&x1,&y1,&w,&h);tft.setCursor(max(4,(tft.width()-int(w))/2),y);tft.print(text);}
void draw(const String &title,const String &detail,uint16_t color){
  const String content=title+"|"+detail+"|"+String(networkReady)+String(serviceReady);
  if(content==lastVisible)return;lastVisible=content;
  digitalWrite(W5500_CS,HIGH);tft.fillScreen(ST77XX_BLACK);
  textLine("GATE SCANNER",10,2,ST77XX_WHITE);tft.drawFastHLine(8,34,tft.width()-16,ST77XX_WHITE);
  // Wrap plain ASCII messages to the measured landscape text width.
  String remaining=title;int y=60;int columns=(tft.width()-16)/12;
  for(int row=0;row<4 && remaining.length();row++) {int cut=min(columns,int(remaining.length()));if(cut<int(remaining.length())){int space=remaining.lastIndexOf(' ',cut);if(space>0)cut=space;}textLine(remaining.substring(0,cut),y,2,color);remaining.remove(0,cut);remaining.trim();y+=25;}
  textLine(detail.substring(0,(tft.width()-16)/6),178,1,ST77XX_WHITE);
  tft.drawFastHLine(8,tft.height()-32,tft.width()-16,ST77XX_WHITE);
  textLine(String(networkReady?"Ethernet OK":"Ethernet offline")+" / "+(serviceReady?"Server OK":"Server unavailable"),tft.height()-21,1,ST77XX_WHITE);
  digitalWrite(TFT_CS,HIGH);
}
bool saveQueue(){JsonDocument doc;JsonArray events=doc["events"].to<JsonArray>();for(size_t i=0;i<pendingCount;i++){JsonObject e=events.add<JsonObject>();e["id"]=pending[i].id;e["uid"]=pending[i].uid;e["time"]=pending[i].occurredAt;}String encoded;serializeJson(doc,encoded);bool ok=settings.putString("queue",encoded)>0;if(!ok)storageFault=true;return ok;}
bool hexValue(const String &value){for(char c:value)if(!isxdigit(c))return false;return value.length()>0;}
void restoreQueue(){
  JsonDocument doc;String saved=settings.getString("queue","{\"events\":[]}");
  if(saved.length()>2048||deserializeJson(doc,saved)||!doc["events"].is<JsonArray>()||doc["events"].size()>QUEUE_CAPACITY){storageFault=true;return;}
  for(JsonVariant value:doc["events"].as<JsonArray>()){
    JsonObject e=value.as<JsonObject>();String id=e["id"]|"",uid=e["uid"]|"",time=e["time"]|"";
    if(!e["id"].is<String>()||!e["uid"].is<String>()||!e["time"].is<String>()||id.length()!=32||!hexValue(id)||!hexValue(uid)||(uid.length()!=8&&uid.length()!=14&&uid.length()!=20)||(time.length()&&time.length()!=24)){
      pendingCount=0;storageFault=true;return;
    }
    pending[pendingCount++]={id,uid,time};
  }
}
void failed(uint32_t now,const char *reason){
  requestFailures++;lastNetworkError=reason;
  Serial.printf("[NETWORK] Request failed: %s / request=%d / elapsed=%lu ms / pending=%u\n",reason,int(request),request==Request::NONE?0UL:static_cast<unsigned long>(now-requestStarted),unsigned(pendingCount));
  transport.stop();request=Request::NONE;serviceReady=false;state=State::SERVICE_UNAVAILABLE;retryAt=millis()+2000;light(80,0,0);draw("SERVICE UNAVAILABLE","Please ask guard",ST77XX_RED);
}
void start(Request kind,const String &path,const String &body,uint32_t now){
  if(key.length()!=64||!backend||beepUntil)return;
  digitalWrite(TFT_CS,HIGH);transport.stop();transport.setConnectionTimeout(750);
  requestStamp=kind==Request::TIME?"":number(serverNow());
  requestSignature=hmac("POST\n"+path+"\n"+requestStamp+"\n"+body);
  if(!transport.connect(backend,port)){failed(updateTime(),"TCP_CONNECT");return;}
  String header="POST "+path+" HTTP/1.1\r\nHost: "+host+"\r\nConnection: close\r\nContent-Type: application/json\r\nX-Device-ID: "+deviceId+"\r\nX-Timestamp: "+requestStamp+"\r\nX-Signature: "+requestSignature+"\r\nContent-Length: "+String(body.length())+"\r\n\r\n";
  transport.print(header);transport.print(body);response="";request=kind;requestStarted=updateTime();
}
void finish(uint32_t now){
  int split=response.indexOf("\r\n\r\n");if(split<0){failed(now,"INCOMPLETE_HTTP");return;}
  String headers=response.substring(0,split),body=response.substring(split+4),lower=headers;lower.toLowerCase();
  int status=response.substring(9,12).toInt();int signaturePos=lower.indexOf("x-response-signature: ");
  int signatureEnd=signaturePos<0?-1:headers.indexOf("\r\n",signaturePos);
  String signature=signaturePos<0?"":headers.substring(signaturePos+22,signatureEnd<0?headers.length():signatureEnd);signature.trim();
  if(status==401)clockReady=false;
  if(signature!=hmac(requestStamp+"\n"+requestSignature+"\n"+body)){Serial.printf("[NETWORK] HTTP status: %d\n",status);failed(now,"RESPONSE_SIGNATURE");return;}
  JsonDocument doc;if(deserializeJson(doc,body)||status<200||status>=300){if(status==401)clockReady=false;Serial.printf("[NETWORK] HTTP status: %d\n",status);failed(now,"HTTP_OR_JSON");return;}
  Request completed=request;request=Request::NONE;transport.stop();serviceReady=true;
  if(completed==Request::TIME){
    if(doc["data"]["nonce"].as<String>()!=nonce||!doc["data"]["unixMs"].is<uint64_t>()){failed(now,"CLOCK_RESPONSE");return;}
    serverBase=doc["data"]["unixMs"].as<uint64_t>();clockUptime=uptime;clockReady=true;serviceReady=false;heartbeatAt=now;return;
  }
  if(completed==Request::SCAN){
    JsonObject result=doc["data"];String code=result["result"]|"";
    if(!pendingCount||result["eventId"].as<String>()!=pending[0].id||!code.length()){failed(now,"EVENT_RESPONSE");return;}
    Serial.printf("[GATE] Result=%s / reply=%lu ms / pending=%u\n",code.c_str(),static_cast<unsigned long>(now-requestStarted),unsigned(pendingCount));
    bool success=code=="ENTRY_RECORDED"||code=="EXIT_RECORDED",notice=code=="ENTRY_RECORDED_WITH_NOTICE";
    resultText=result["message"]|"PLEASE SEE GUARD";state=State::RESULT;resultUntil=now+900;
    light(success?0:80,success?90:notice?45:0,0);draw(resultText,notice?"Entry recorded with notice":String(result["displayName"]|""),success?ST77XX_GREEN:notice?ST77XX_YELLOW:ST77XX_RED);
    if(code!="DUPLICATE_SCAN")beep(now,success?55:100);
    for(size_t i=1;i<pendingCount;i++)pending[i-1]=pending[i];if(pendingCount)pendingCount--;saveQueue();
  }
  heartbeatAt=now+5000;
}
void networkTick(uint32_t now){
  digitalWrite(TFT_CS,HIGH);
  const int link=int(Ethernet.linkStatus());
  if(link!=lastLink){if(lastLink==int(LinkON)&&link!=int(LinkON))linkDrops++;lastLink=link;Serial.printf("[NETWORK] Link=%s / hardware=%d\n",link==int(LinkON)?"ON":link==int(LinkOFF)?"OFF":"UNKNOWN",int(Ethernet.hardwareStatus()));}
  if(link!=int(LinkON)){networkReady=false;serviceReady=false;if(request!=Request::NONE)failed(now,"ETHERNET_LINK_LOST");state=State::NETWORK_OFFLINE;light(80,0,0);draw("NETWORK UNAVAILABLE","Reconnecting - please see guard",ST77XX_RED);return;}
  if(!networkReady && due(now,networkAt)) {
    if(beepUntil)return;
    state=State::NETWORK_CONNECTING;draw("CONNECTING ETHERNET",staticNetwork?"Applying saved address":"Requesting address",ST77XX_YELLOW);
    if(staticNetwork){
      if(staticIp==backend){lastNetworkError="IP_CONFLICT_CONFIG";Serial.println("[NETWORK] Scanner IP must differ from backend IP.");networkAt=now+5000;return;}
      Ethernet.begin(mac,staticIp,staticGateway,staticGateway,staticMask);networkReady=Ethernet.localIP()==staticIp;
    }else networkReady=Ethernet.begin(mac,10000,2000)!=0;
    networkAt=updateTime()+5000;
    if(networkReady){Serial.printf("[NETWORK] %s configured. Scanner IP: ",staticNetwork?"STATIC":"DHCP");Serial.println(Ethernet.localIP());}
    else{lastNetworkError="ADDRESS_FAILED";Serial.println("[NETWORK] Address setup failed; check router LAN/DHCP.");}
    return;
  }
  if(!networkReady)return;
  if(request!=Request::NONE){
    // Drain replies even while feedback is active; avoid a SPI transaction per byte.
    char buffer[128];size_t budget=1024;
    while(transport.available()&&budget){int n=transport.read(reinterpret_cast<uint8_t*>(buffer),min(sizeof(buffer),budget));if(n<=0)break;response.concat(buffer,unsigned(n));budget-=n;if(response.length()>4096){failed(now,"RESPONSE_TOO_LARGE");return;}}
    if(!transport.connected()&&!transport.available()){finish(now);return;}
    if(now-requestStarted>REQUEST_TIMEOUT_MS){failed(now,"RESPONSE_TIMEOUT");return;}return;
  }
  // DHCP maintenance may block, so never run it in the middle of a signed response.
  // Static mode must skip maintain: Ethernet retains its DHCP object after a mode change.
  if(!staticNetwork&&!beepUntil&&due(now,networkAt)){
    uint32_t began=now;int result=Ethernet.maintain();now=updateTime();networkAt=now+1000;
    if(result){Serial.printf("[NETWORK] DHCP maintenance result=%d / elapsed=%lu ms / uptime=%lu s\n",result,static_cast<unsigned long>(now-began),static_cast<unsigned long>(now/1000));}
    // The library does not expose lease expiry. Reacquire conservatively rather than keep an expired address.
    if(result==1||result==3){lastNetworkError="DHCP_MAINTENANCE";networkReady=false;serviceReady=false;return;}
  }
  if(!due(now,retryAt)||beepUntil)return;
  JsonDocument doc;String body;
  if(!clockReady){nonce=eventId();doc["nonce"]=nonce;serializeJson(doc,body);start(Request::TIME,"/api/gate/time",body,now);return;}
  if(pendingCount){Event &event=pending[0];doc["eventId"]=event.id;doc["deviceId"]=deviceId;doc["uid"]=event.uid;if(event.occurredAt.length())doc["occurredAt"]=event.occurredAt;else doc["occurredAt"]=nullptr;serializeJson(doc,body);start(Request::SCAN,"/api/entry-logs/scan",body,now);return;}
  if(due(now,heartbeatAt)){doc["state"]=storageFault||!readerReady?"DEGRADED":"ONLINE";serializeJson(doc,body);start(Request::HEARTBEAT,"/api/gate/heartbeat",body,now);}
}
void serialTick(){
  while(Serial.available()){char c=Serial.read();if(c=='\r')continue;if(c!='\n'){if(serialLine.length()<180)serialLine+=c;continue;}String command=serialLine;serialLine="";command.trim();
    if(command.startsWith("backend set ")){String address=command.substring(12);int split=address.indexOf(':');IPAddress candidate;int p=address.substring(split+1).toInt();if(split>0&&candidate.fromString(address.substring(0,split))&&p>0&&p<65536){host=address.substring(0,split);backend=candidate;port=p;settings.putString("host",host);settings.putUShort("port",port);clockReady=false;serviceReady=false;Serial.println("[CONFIG] Backend saved.");}else Serial.println("[CONFIG] Use backend set IPv4:port");}
    else if(command.startsWith("backend key ")){String value=command.substring(12);bool valid=value.length()==64;for(char ch:value)if(!isxdigit(ch))valid=false;if(valid){key=value;settings.putString("key",key);clockReady=false;Serial.println("[CONFIG] Gate key saved (hidden).");}else Serial.println("[CONFIG] Expected 64 hexadecimal characters.");}
    else if(command=="backend show"){Serial.printf("[CONFIG] Backend: %s:%u / Device: %s / Key: %s / Pending: %u\n",host.c_str(),port,deviceId.c_str(),key.length()?"configured":"missing",unsigned(pendingCount));}
    else if(command=="backend check"){clockReady=false;retryAt=0;Serial.println("[NETWORK] Signed connection check requested.");}
    else if(command=="network show")networkReport();
    else if(command.startsWith("network static ")){
      String value=command.substring(15);IPAddress ip,gateway,mask;
      if(!parseStatic(value,ip,gateway,mask)||ip==backend){Serial.println("[CONFIG] Use network static IP GATEWAY MASK; distinct usable addresses on the same subnet are required.");continue;}
      if(settings.putString("network",value)==0){Serial.println("[CONFIG] Save failed; network unchanged.");continue;}
      staticIp=ip;staticGateway=gateway;staticMask=mask;staticNetwork=true;restartNetwork();
      Serial.println("[CONFIG] Static network saved. Ensure this IP is unused and excluded from the router DHCP pool.");
    }
    else if(command=="network dhcp"){
      if(settings.putString("network","dhcp")==0){Serial.println("[CONFIG] Save failed; network unchanged.");continue;}
      staticNetwork=false;restartNetwork();Serial.println("[CONFIG] DHCP mode saved.");
    }
    else Serial.println("[CONFIG] Commands: backend set IPv4:port | backend key KEY | backend show | backend check | network show | network static IP GATEWAY MASK | network dhcp");
  }
}
void setup(){
  Serial.begin(115200);pinMode(BUZZER_PIN,OUTPUT);digitalWrite(BUZZER_PIN,HIGH);response.reserve(4224);
  Serial.printf("[BOOT] Reset reason=%d (brownout=%d)\n",int(esp_reset_reason()),int(ESP_RST_BROWNOUT));
  pinMode(TFT_CS,OUTPUT);pinMode(W5500_CS,OUTPUT);digitalWrite(TFT_CS,HIGH);digitalWrite(W5500_CS,HIGH);
  pixels.begin();pixels.setBrightness(30);light(50,0,70);
  settings.begin("gate-scanner",false);host=settings.getString("host","");port=settings.getUShort("port",4000);key=settings.getString("key","");deviceId="gate-01";backend.fromString(host);restoreQueue();
  String savedNetwork=settings.getString("network","dhcp");
  staticNetwork=parseStatic(savedNetwork,staticIp,staticGateway,staticMask);
  if(savedNetwork!="dhcp"&&!staticNetwork)Serial.println("[CONFIG] Invalid saved static network; using DHCP.");
  SPI.begin(SPI_SCK,SPI_MISO,SPI_MOSI);tft.init(240,320);tft.setRotation(TFT_ROTATION);tft.setTextWrap(false);draw("STARTING","Gate firmware v1.2",ST77XX_WHITE);
  Serial2.begin(115200,SERIAL_8N1,PN532_RX,PN532_TX);reader.begin();readerReady=reader.getFirmwareVersion()!=0;if(readerReady)reader.SAMConfig();
  pinMode(W5500_RST,OUTPUT);digitalWrite(W5500_RST,LOW);delay(100);digitalWrite(W5500_RST,HIGH);delay(200);
  digitalWrite(TFT_CS,HIGH);Ethernet.init(W5500_CS);Ethernet.begin(mac,IPAddress(0,0,0,0));
  Serial.println("[FIRMWARE] GATE SCANNER v1.2 / port 2 / landscape");Serial.println(readerReady?"[RFID] PN532 ready":"[RFID] PN532 unavailable");
}
void loop(){
  uint32_t now=updateTime();stopBeep(now);
  serialTick();
  networkTick(updateTime());now=updateTime();stopBeep(now);
  if(readerReady&&!storageFault&&!beepUntil&&due(now,readAt)){
    readAt=now+40;uint8_t uid[10],length=0;
    if(readCard(uid,length)){
      now=updateTime();
      char out[21];for(uint8_t i=0;i<length;i++)snprintf(out+i*2,3,"%02X",uid[i]);String current(out);
      bool same=current==lastUid;bool accept=!same || ((now-lastSeen)>800 && (now-lastAccepted)>SAME_CARD_COOLDOWN_MS);lastSeen=now;
      if(accept){lastUid=current;lastAccepted=now;beep(now,35);
        if(pendingCount>=QUEUE_CAPACITY){state=State::RESULT;resultUntil=now+1500;light(80,0,0);draw("QUEUE FULL","Not recorded - please see guard",ST77XX_RED);}
        else {pending[pendingCount++]={eventId(),current,isoTime()};if(saveQueue()){state=State::PROCESSING;light(80,60,0);draw(serviceReady?"CARD DETECTED":"VERIFICATION UNAVAILABLE",serviceReady?"Verifying":"Saved for review - see guard",ST77XX_YELLOW);}}
      }
    }
  }
  now=updateTime();stopBeep(now);
  if(storageFault){light(80,0,0);draw("STORAGE ERROR","Please see guard",ST77XX_RED);}
  else if(!readerReady){light(80,0,0);draw("READER UNAVAILABLE","Check PN532 wiring",ST77XX_RED);}
  else if(key.length()!=64||!backend){light(80,0,0);draw("SETUP REQUIRED","Configure gate backend and key by USB",ST77XX_RED);}
  else if(networkReady&&serviceReady&&!pendingCount&&request==Request::NONE&&(state!=State::RESULT||due(now,resultUntil))){state=State::READY;light(0,0,70);draw("TAP STUDENT ID","Ready",ST77XX_WHITE);}
}
