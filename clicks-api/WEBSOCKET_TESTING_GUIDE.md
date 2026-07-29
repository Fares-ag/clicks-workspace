# WebSocket Testing Guide

## ⚠️ **Why WebSockets Are Not in Postman Collection**

**Postman does NOT support Socket.IO WebSocket connections** in the collection JSON format. WebSockets require persistent bidirectional connections that Postman's REST-based collection system cannot handle.

---

## 🔧 **How to Test WebSocket Endpoints**

### **Method 1: Node.js Test Scripts** ✅ (Recommended)

We've provided ready-to-use test scripts in the `test-scripts/` folder.

#### **Setup:**

```bash
# 1. Navigate to test-scripts folder
cd test-scripts

# 2. Install dependencies (if not already installed)
npm install socket.io-client

# 3. Update configuration in the test files
# Edit test-customer-sos.js and test-technician-sos.js
# - SERVER_URL
# - CUSTOMER_ID / TECHNICIAN_ID
# - VEHICLE_ID
# - JWT_TOKEN (if required)
```

#### **Test Customer SOS Flow:**

```bash
node test-customer-sos.js
```

**Expected Output:**
```
✅ Connected to customer namespace
📝 Registered customer: 673abc123def456789012345

🚨 Creating SOS request...

✅ SOS Created: {
  sos_id: '673sos789ghi012345678901',
  status: 'pending',
  expires_at: '2025-10-29T10:01:00Z'
}

⏳ Waiting for technician to accept (60 seconds)...

🎉 SOS ACCEPTED by technician!
   Job ID: 673job123mno456789012345
   Technician: Ahmed Ali
   Phone: 9876543210
   Distance: 5.2 km
```

#### **Test Technician SOS Acceptance:**

```bash
node test-technician-sos.js
```

**Expected Output:**
```
✅ Connected to technician namespace
📝 Registered technician: 673xyz789abc012345678901

📍 Sending location updates every 5 seconds...

🚨 NEW SOS REQUEST RECEIVED!
   SOS ID: 673sos789ghi012345678901
   Customer: John Doe
   Vehicle: Toyota Camry 2020
   Distance: 5.2 km
   Expires at: 2025-10-29T10:01:00Z

Press 'a' + Enter to accept...

✅ SOS ACCEPTED!
   Job ID: 673job123mno456789012345
```

---

### **Method 2: Online Socket.IO Client Tools** 🌐

#### **Option A: Socket.IO Client Tool (Web-based)**

**URL:** https://amritb.github.io/socketio-client-tool/

**Steps:**
1. Open the URL in browser
2. Enter Socket URL: `http://localhost:5001/customer`
3. Add Authentication:
   - Key: `token`
   - Value: `your_jwt_token_here`
4. Click "Connect"
5. Emit events and listen for responses

**Example - Create SOS:**
```json
Event: createSOS
Data: {
  "customer_id": "673abc123def456789012345",
  "customer_vehicle_id": "673veh456def789012345678",
  "latitude": 25.2048,
  "longitude": 55.2708
}
```

#### **Option B: Postman WebSocket (Beta)**

**Note:** Postman has a WebSocket feature in beta, but it doesn't support Socket.IO protocol properly.

1. Open Postman Desktop App
2. Click "New" → "WebSocket Request"
3. Enter: `ws://localhost:5001/socket.io/?EIO=4&transport=websocket`
4. Click "Connect"
5. Send Socket.IO protocol messages (complex, not recommended)

---

### **Method 3: Browser Developer Console** 🖥️

#### **Test Customer SOS:**

```javascript
// 1. Include Socket.IO client in your HTML
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>

// 2. Open browser console (F12)
// 3. Paste this code:

const socket = io('http://localhost:5001/customer', {
  auth: {
    token: 'your_jwt_token_here'
  }
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
  
  // Register
  socket.emit('register', 'your_customer_id');
  
  // Create SOS
  socket.emit('createSOS', {
    customer_id: 'your_customer_id',
    customer_vehicle_id: 'your_vehicle_id',
    latitude: 25.2048,
    longitude: 55.2708
  });
});

socket.on('sosCreated', (data) => {
  console.log('✅ SOS Created:', data);
});

socket.on('sosAccepted', (data) => {
  console.log('🎉 SOS Accepted:', data);
});

socket.on('sosExpired', (data) => {
  console.log('⏰ SOS Expired:', data);
});
```

#### **Test Technician:**

```javascript
const socket = io('http://localhost:5001/technician', {
  auth: {
    token: 'your_jwt_token_here'
  }
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
  
  // Register
  socket.emit('register', 'your_technician_id');
  
  // Send location
  setInterval(() => {
    socket.emit('updateLocation', {
      technician_id: 'your_technician_id',
      latitude: 25.2100,
      longitude: 55.2750
    });
    console.log('📍 Location sent');
  }, 5000);
});

socket.on('newSOSRequest', (data) => {
  console.log('🚨 NEW SOS:', data);
  
  // Accept it
  socket.emit('acceptSOS', {
    sos_id: data.sos_id,
    technician_id: 'your_technician_id'
  });
});

socket.on('sosAcceptedConfirm', (data) => {
  console.log('✅ Accepted:', data);
});
```

---

### **Method 4: Chrome Extensions** 🔌

#### **Smart Websocket Client**

**Install:** Chrome Web Store → Search "Smart Websocket Client"

**Steps:**
1. Install extension
2. Open extension
3. Enter URL: `ws://localhost:5001/socket.io/?EIO=4&transport=websocket`
4. Connect
5. Send Socket.IO formatted messages

**Note:** Socket.IO protocol is complex - using test scripts is easier.

---

### **Method 5: Python Script** 🐍

```python
import socketio

# Create client
sio = socketio.Client()

@sio.event
def connect():
    print('✅ Connected')
    sio.emit('register', 'customer_id_here')
    
@sio.on('sosCreated')
def sos_created(data):
    print('✅ SOS Created:', data)

@sio.on('sosAccepted')
def sos_accepted(data):
    print('🎉 SOS Accepted:', data)

# Connect with auth
sio.connect('http://localhost:5001/customer', 
            auth={'token': 'your_jwt_token'})

# Create SOS
sio.emit('createSOS', {
    'customer_id': 'customer_id',
    'customer_vehicle_id': 'vehicle_id',
    'latitude': 25.2048,
    'longitude': 55.2708
})

# Keep alive
sio.wait()
```

---

## 📊 **Complete WebSocket Event Reference**

### **Customer Events:**

| Direction | Event | Data | Testing Command |
|-----------|-------|------|-----------------|
| Emit | `register` | `customerId` | `socket.emit('register', customerId)` |
| Emit | `createSOS` | `customer_id, customer_vehicle_id, latitude, longitude` | `socket.emit('createSOS', {...})` |
| Emit | `cancelSOS` | `sos_id, reason` | `socket.emit('cancelSOS', {...})` |
| Listen | `sosCreated` | `sos_id, status, expiresAt` | `socket.on('sosCreated', (data) => {...})` |
| Listen | `sosAccepted` | `job_id, technician, distance` | `socket.on('sosAccepted', (data) => {...})` |
| Listen | `sosExpired` | `sos_id, message` | `socket.on('sosExpired', (data) => {...})` |
| Listen | `jobStatusUpdate` | `job_id, status, distance, location` | `socket.on('jobStatusUpdate', (data) => {...})` |

### **Technician Events:**

| Direction | Event | Data | Testing Command |
|-----------|-------|------|-----------------|
| Emit | `register` | `technicianId` | `socket.emit('register', technicianId)` |
| Emit | `updateLocation` | `technician_id, latitude, longitude` | `socket.emit('updateLocation', {...})` |
| Emit | `acceptSOS` | `sos_id, technician_id` | `socket.emit('acceptSOS', {...})` |
| Emit | `updateJobStatus` | `job_id, status, customer_id, latitude, longitude, distance` | `socket.emit('updateJobStatus', {...})` |
| Listen | `newSOSRequest` | `sos_id, customer, vehicle, location, distance, expires_at` | `socket.on('newSOSRequest', (data) => {...})` |
| Listen | `sosAcceptedConfirm` | `job_id, customer, vehicle, location` | `socket.on('sosAcceptedConfirm', (data) => {...})` |
| Listen | `sosAlreadyAccepted` | `sos_id, message` | `socket.on('sosAlreadyAccepted', (data) => {...})` |

---

## 🧪 **Testing Scenarios**

### **Scenario 1: Successful SOS → Job Flow**

**Terminal 1 (Technician):**
```bash
node test-technician-sos.js
# Wait for connection
# Wait for SOS notification
# Type 'a' + Enter to accept
```

**Terminal 2 (Customer):**
```bash
node test-customer-sos.js
# Wait for connection
# SOS will be created automatically
# Wait for acceptance notification
```

**Expected Flow:**
1. Technician connects and sends location
2. Customer creates SOS
3. Technician receives notification
4. Technician accepts
5. Customer receives acceptance
6. Job is auto-created

### **Scenario 2: SOS Expiration**

**Terminal 1 (Customer):**
```bash
node test-customer-sos.js
# SOS created
# Wait 60 seconds
# Should receive 'sosExpired' event
```

**No Technician:** Don't run technician script

**Expected Result:**
- After 60 seconds, customer receives `sosExpired` event

### **Scenario 3: Multiple Technicians**

**Terminal 1 (Tech 1):**
```bash
TECHNICIAN_ID=tech1 node test-technician-sos.js
```

**Terminal 2 (Tech 2):**
```bash
TECHNICIAN_ID=tech2 node test-technician-sos.js
```

**Terminal 3 (Customer):**
```bash
node test-customer-sos.js
```

**Expected Result:**
- Both technicians receive SOS
- First to accept gets the job
- Second receives `sosAlreadyAccepted`

---

## 🔐 **Authentication for WebSocket Testing**

### **Get JWT Token:**

```bash
# 1. Login via REST API (use Postman)
POST http://localhost:5001/api/customers/login
Body: {
  "phone_number": "1234567890",
  "password": "password123"
}

# Response includes token
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

# 2. Use this token in WebSocket connection
const socket = io('http://localhost:5001/customer', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

---

## 📱 **Mobile App Integration**

### **Flutter (Dart):**

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket socket = IO.io('http://localhost:5001/customer', <String, dynamic>{
  'auth': {'token': jwtToken},
  'transports': ['websocket'],
  'autoConnect': false,
});

socket.connect();

socket.on('connect', (_) {
  print('Connected');
  socket.emit('register', customerId);
});

socket.on('sosCreated', (data) {
  print('SOS Created: $data');
});

// Create SOS
socket.emit('createSOS', {
  'customer_id': customerId,
  'customer_vehicle_id': vehicleId,
  'latitude': 25.2048,
  'longitude': 55.2708
});
```

### **React Native (JavaScript):**

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5001/customer', {
  auth: { token: jwtToken },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('register', customerId);
});

socket.on('sosCreated', (data) => {
  console.log('SOS Created:', data);
});

// Create SOS
socket.emit('createSOS', {
  customer_id: customerId,
  customer_vehicle_id: vehicleId,
  latitude: 25.2048,
  longitude: 55.2708
});
```

---

## 🐛 **Debugging Tips**

### **Check if Server is Running:**
```bash
curl http://localhost:5001/socket.io/?EIO=4&transport=polling

# Should return Socket.IO handshake
```

### **Enable Debug Logs:**

**Node.js Test Scripts:**
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:5001/customer', {
  auth: { token: jwtToken },
  transports: ['websocket'],
  // Enable debug
  debug: true
});
```

**Environment Variable:**
```bash
DEBUG=socket.io-client:* node test-customer-sos.js
```

### **Common Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| Connection refused | Server not running | Start server: `npm run dev` |
| Unauthorized | Invalid/missing token | Get fresh token from login |
| Event not received | Wrong namespace | Check `/customer` vs `/technician` |
| No SOS broadcast | Tech not online | Set technician status to "Online" |

---

## 📚 **Additional Resources**

**Documentation:**
- Complete Flow: `SOS_COMPLETE_FLOW_GUIDE.md`
- Quick Reference: `SOS_QUICK_REFERENCE.md`
- Visual Diagram: `SOS_FLOW_DIAGRAM.md`

**Test Scripts:**
- `test-scripts/test-customer-sos.js`
- `test-scripts/test-technician-sos.js`
- `test-scripts/README.md`

**Online Tools:**
- Socket.IO Client: https://amritb.github.io/socketio-client-tool/
- Socket.IO Docs: https://socket.io/docs/v4/client-api/

---

## ✅ **Summary**

**Why not in Postman?**
- Postman collections only support REST APIs
- WebSocket/Socket.IO requires persistent connections
- Socket.IO has complex protocol (polling + websocket)

**Best Testing Methods:**
1. ✅ **Node.js test scripts** (easiest, already provided)
2. ✅ **Browser console** (quick testing)
3. ✅ **Online Socket.IO tools** (no installation)
4. ✅ **Mobile app integration** (production testing)

**For Production:**
- Integrate Socket.IO client in your mobile apps
- Use the test scripts for backend validation
- Reference the complete flow guides for implementation

---

**Version:** 1.0  
**Last Updated:** October 29, 2025
