#!/bin/zsh
# Smoke test of the store app on a simulated phone, before every store build:
#   app/sim-test/run.sh ios       iPhone simulator (Xcode; newest iOS runtime, or SIM_UDID=…)
#   app/sim-test/run.sh android   Android emulator (AVD=papamap-api35 by default, started if not running)
# Builds the app with sim-test/mock.js as the shell's first script, installs it
# fresh, drives the popup flows and screenshots each step into sim-test/out/.
# Nothing reaches OpenStreetMap: the mock answers for OSM, Photon and the delta.
set -u
cd "$(dirname "$0")/.."
PLATFORM=${1:?usage: run.sh ios|android}
OUT=sim-test/out
mkdir -p "$OUT"; rm -f "${OUT:?}"/*.png; : > "$OUT/app.log"
npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null || exit 1
cp sim-test/mock.js www/mock.js
sed -i '' 's#<head>#<head><script src="mock.js"></script>#' www/index.html
npx cap sync $PLATFORM >/dev/null || exit 1

if [ "$PLATFORM" = ios ]; then
  UDID=${SIM_UDID:-$(xcrun simctl list devices available -j | python3 -c '
import json, sys
d = json.load(sys.stdin)["devices"]
print(next(x["udid"] for k in sorted((k for k in d if "iOS" in k), reverse=True) for x in d[k] if x["name"].startswith("iPhone")))')}
  xcodebuild build -quiet -project ios/App/App.xcodeproj -scheme App -configuration Debug \
    -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$OUT/DerivedData" CODE_SIGNING_ALLOWED=NO \
    > "$OUT/xcodebuild.log" 2>&1 || { tail -30 "$OUT/xcodebuild.log"; exit 1; }
  xcrun simctl bootstatus $UDID -b >/dev/null
  xcrun simctl uninstall $UDID de.papamap.app 2>/dev/null
  xcrun simctl install $UDID "$OUT/DerivedData/Build/Products/Debug-iphonesimulator/App.app" || exit 1
  xcrun simctl privacy $UDID grant location de.papamap.app
  xcrun simctl location $UDID set 53.5691,9.9634
  xcrun simctl launch --console-pty --terminate-running-process $UDID de.papamap.app > "$OUT/app.log" 2>&1 &
  LOG_PID=$!
  shoot() { xcrun simctl io $UDID screenshot "$1" >/dev/null 2>&1; }
else
  export JAVA_HOME=${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}
  export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
  ADB=$ANDROID_HOME/platform-tools/adb
  (cd android && ./gradlew -q assembleDebug) || exit 1
  if [ "$($ADB get-state 2>/dev/null)" != device ]; then
    $ANDROID_HOME/emulator/emulator -avd ${AVD:-papamap-api35} -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect >/dev/null 2>&1 &
    $ADB wait-for-device
  fi
  until [ "$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
  $ADB uninstall de.papamap.app >/dev/null 2>&1
  $ADB install -r android/app/build/outputs/apk/debug/app-debug.apk >/dev/null || exit 1
  $ADB shell pm grant de.papamap.app android.permission.ACCESS_FINE_LOCATION
  $ADB emu geo fix 9.9634 53.5691 >/dev/null
  $ADB shell wm dismiss-keyguard
  $ADB logcat -c
  $ADB logcat -v raw -s Capacitor/Console > "$OUT/app.log" 2>&1 &
  LOG_PID=$!
  $ADB shell am start -W -n de.papamap.app/.MainActivity >/dev/null
  shoot() { $ADB exec-out screencap -p > "$1"; }
fi

seen=0
for i in $(seq 1 720); do   # six minutes at most
  n=$(grep -c 'SHOT' "$OUT/app.log")
  while [ "$seen" -lt "$n" ]; do
    seen=$((seen + 1))
    name=$(grep 'SHOT' "$OUT/app.log" | sed -n "${seen}p" | sed -E 's/.*SHOT ([^ ]+).*/\1/' | tr -d '\r')
    shoot "$OUT/$name.png"
  done
  grep -q '\[TEST\].*\(DONE\|FAIL\)' "$OUT/app.log" && break
  sleep 0.5
done
kill $LOG_PID 2>/dev/null   # on iOS this also ends the app
grep '\[TEST\]' "$OUT/app.log" | sed 's/^.*\[TEST\]/[TEST]/' | cut -c1-300
if grep -q '\[TEST\].*DONE' "$OUT/app.log"; then echo "PASS: $(ls "$OUT"/*.png | wc -l | tr -d ' ') screenshots in app/$OUT"; else echo "FAIL: see app/$OUT/app.log"; exit 1; fi
