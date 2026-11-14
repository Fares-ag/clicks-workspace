# Local demo stack — restart commands

Proven working on 2026-10-10. Nothing here touches `clicks-user`, `clicks-api`
source, or any production database.

## 1. Database (cached mongod, temp dbpath)

```bash
MONGOD="$HOME/.cache/mongodb-binaries/mongod-x64-win32-7.0.24.exe"
DBPATH="<scratch>/demo/dbdata"     # any empty folder
"$MONGOD" --dbpath "$DBPATH" --port 27099 --bind_ip 127.0.0.1
```

## 2. Seed fictional demo data

```bash
cd clicks-api
MONGODB_URI="mongodb://127.0.0.1:27099/clicks_demo" node scripts/seed-demo-data.js
```

Creates: customer **Ahmed Khalil / +97433333333 / Customer123!**, technicians
Omar + Sara, admin, sources, vehicle catalogue, FAQs.

## 3. Customer-tech API

`NODE_PATH` is required locally: `clicks-shared` resolves `axios` from the
API's own `node_modules`, which only works in the Docker layout otherwise.

```bash
cd clicks-api/clicks-customer-tech-api
MONGODB_URI="mongodb://127.0.0.1:27099/clicks_demo" \
JWT_SECRET="demo-video-secret-not-production" \
PORT=5101 NODE_ENV=development \
NODE_PATH="$(pwd)/node_modules" \
node src/index.js
```

Verify: `curl http://127.0.0.1:5101/api/health` → `{"status":"ok","db":"up"}`
Login:  `curl -X POST http://127.0.0.1:5101/api/customers/login -H "Content-Type: application/json" -d '{"phone_number":"+97433333333","password":"Customer123!"}'`

## 4. App build (profile — release fail-closes on local URLs)

```bash
cd clicks-user
flutter build apk --profile \
  --dart-define=API_BASE_URL=https://10.0.2.2:5443 \
  --dart-define=SOCKET_URL=https://10.0.2.2:5443 \
  --dart-define=GOOGLE_MAPS_API_KEY=<android/local.properties>
```

Still to build (Stage 2): the TLS proxy on 5443 + CA installed as a system cert
on the rooted emulator, because the app sets `usesCleartextTraffic="false"`.

## Capture

```bash
adb -s emulator-5554 shell screenrecord --size 1080x2400 /sdcard/shot.mp4
adb -s emulator-5554 pull /sdcard/shot.mp4 footage/
```
