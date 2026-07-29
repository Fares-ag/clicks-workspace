# Complete SOS System Flow Guide

## 📱 Two Separate Apps Architecture

This guide assumes:
- **Customer App** - Flutter/React Native app for customers
- **Technician App** - Flutter/React Native app for technicians
- **Backend Server** - Node.js with Socket.IO and REST APIs

---

## 🔌 WebSocket Connection Setup

### **Customer App - Initial Setup**

```javascript
// Customer App - WebSocket Connection
import io from 'socket.io-client';

// 1. Get JWT token after login
const customerToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // From login response

// 2. Connect to customer namespace
const socket = io('http://your-server.com/customer', {
  transports: ['websocket'],
  auth: {
    token: customerToken
  }
});

// 3. Listen for connection
socket.on('connect', () => {
  console.log('✅ Connected to server:', socket.id);
  
  // 4. Register customer ID
  socket.emit('register', customerId);
});

// 5. Handle connection errors
socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from server');
});
```

### **Technician App - Initial Setup**

```javascript
// Technician App - WebSocket Connection
import io from 'socket.io-client';

// 1. Get JWT token after login
const technicianToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // From login response

// 2. Connect to technician namespace
const socket = io('http://your-server.com/technician', {
  transports: ['websocket'],
  auth: {
    token: technicianToken
  }
});

// 3. Listen for connection
socket.on('connect', () => {
  console.log('✅ Connected to server:', socket.id);
  
  // 4. Register technician ID
  socket.emit('register', technicianId);
});

// 5. Handle connection errors
socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error);
});
```

---

## 📋 Complete SOS Flow (Step-by-Step)

---

## **STEP 1: Customer Login & Setup**

### **Endpoint:** `POST /api/customers/login`

**Customer App Sends:**
```json
POST http://your-server.com/api/customers/login
Content-Type: application/json

{
  "phone_number": "1234567890",
  "password": "password123"
}
```

**Server Returns:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3M...",
  "customer": {
    "id": "673abc123def456789012345",
    "phone_number": "1234567890",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  }
}
```

**Customer App Stores:**
- `token` → Use for all future REST API calls and WebSocket auth
- `customer.id` → Use as `customerId` for WebSocket events

---

## **STEP 2: Technician Login & Setup**

### **Endpoint:** `POST /api/technicians/login`

**Technician App Sends:**
```json
POST http://your-server.com/api/technicians/login
Content-Type: application/json

{
  "phone": "9876543210",
  "password": "techpass123"
}
```

**Server Returns:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3M...",
  "technician": {
    "id": "673xyz789abc012345678901",
    "phone": "9876543210",
    "firstName": "Ahmed",
    "lastName": "Ali",
    "email": "ahmed@example.com",
    "currentStatus": "Offline",
    "verificationStatus": "approved"
  }
}
```

**Technician App Stores:**
- `token` → Use for all future REST API calls and WebSocket auth
- `technician.id` → Use as `technicianId` for WebSocket events

---

## **STEP 3: Technician Goes Online**

### **Endpoint:** `PATCH /api/technicians/status`

**Technician App Sends:**
```json
PATCH http://your-server.com/api/technicians/status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "status": "Online"
}
```

**Server Returns:**
```json
{
  "message": "Status updated",
  "status": "Online"
}
```

**Important:** Only technicians with status "Online" will receive SOS broadcasts!

---

## **STEP 4: Technician Starts Sending Location Updates**

### **Method:** WebSocket Event (Continuous)

**Technician App Sends (Every 5-10 seconds):**
```javascript
// Start location updates when going online
const locationInterval = setInterval(() => {
  // Get current GPS location
  const latitude = getCurrentLatitude();  // e.g., 25.2048
  const longitude = getCurrentLongitude(); // e.g., 55.2708
  
  // Send to server via WebSocket
  socket.emit('updateLocation', {
    technician_id: '673xyz789abc012345678901',
    latitude: latitude,
    longitude: longitude
  });
  
  console.log('📍 Location sent:', latitude, longitude);
}, 5000); // Every 5 seconds
```

**Data Structure:**
```json
{
  "technician_id": "673xyz789abc012345678901",
  "latitude": 25.2048,
  "longitude": 55.2708
}
```

**Server Action:**
- Updates technician's `currentLocation` in database
- No immediate response to technician
- Stores for distance calculations when SOS is created

**Stop Location Updates When Going Offline:**
```javascript
clearInterval(locationInterval);
socket.emit('updateLocation', {
  technician_id: '673xyz789abc012345678901',
  latitude: null,
  longitude: null
});
```

---

## **STEP 5: Customer Creates SOS Request** 🆘

### **Method:** WebSocket Event

**Customer App Sends:**
```javascript
// Get current GPS location
const latitude = 25.2048;
const longitude = 55.2708;

// Get selected vehicle ID (from customer's vehicle list)
const vehicleId = '673veh456def789012345678';

// Emit SOS creation event
socket.emit('createSOS', {
  customer_id: '673abc123def456789012345',
  customer_vehicle_id: vehicleId,
  latitude: latitude,
  longitude: longitude
});

console.log('🚨 SOS request sent');
```

**Data Structure:**
```json
{
  "customer_id": "673abc123def456789012345",
  "customer_vehicle_id": "673veh456def789012345678",
  "latitude": 25.2048,
  "longitude": 55.2708
}
```

**Customer App Listens for Confirmation:**
```javascript
socket.on('sosCreated', (data) => {
  console.log('✅ SOS Created Successfully!');
  console.log('SOS ID:', data.sos_id);
  
  // Store SOS ID for tracking
  const sosId = data.sos_id;
  
  // Update UI
  showLoadingScreen('Broadcasting to nearby technicians...');
  startCountdownTimer(60); // 60-second countdown
});
```

**Server Response Data:**
```json
{
  "sos_id": "673sos789ghi012345678901",
  "status": "pending",
  "location": {
    "type": "Point",
    "coordinates": [55.2708, 25.2048]
  },
  "expiresAt": "2025-10-29T10:01:00Z"
}
```

**What Happens on Server:**
1. Creates SOSRequest document in database
2. Finds all technicians within 20km who are "Online"
3. Broadcasts SOS to those technicians (see Step 6)
4. Starts 60-second expiration timer

---

## **STEP 6: Technicians Receive SOS Broadcast** 📡

### **Method:** WebSocket Event (Automatic)

**Technician App Listens:**
```javascript
socket.on('newSOSRequest', (data) => {
  console.log('🚨 NEW SOS REQUEST RECEIVED!');
  console.log('SOS ID:', data.sos_id);
  console.log('Customer:', data.customer_name);
  console.log('Distance:', data.distance, 'km');
  console.log('Vehicle:', data.vehicle);
  console.log('Expires at:', data.expires_at);
  
  // Show notification to technician
  showNotification({
    title: 'New SOS Request',
    body: `${data.customer_name} needs help - ${data.distance} km away`,
    sound: 'alert.mp3'
  });
  
  // Navigate to SOS details screen
  navigateToSOSDetails(data);
});
```

**Data Structure Received:**
```json
{
  "sos_id": "673sos789ghi012345678901",
  "customer_id": "673abc123def456789012345",
  "customer_name": "John Doe",
  "customer_phone": "1234567890",
  "customer_vehicle_id": "673veh456def789012345678",
  "vehicle": {
    "make": "Toyota",
    "model": "Camry",
    "year": 2020,
    "color": "Blue",
    "plate_number": "ABC123"
  },
  "location": {
    "type": "Point",
    "coordinates": [55.2708, 25.2048]
  },
  "latitude": 25.2048,
  "longitude": 55.2708,
  "distance": 5.2,
  "expires_at": "2025-10-29T10:01:00Z"
}
```

**Technician App UI:**
```
┌─────────────────────────────┐
│  🚨 NEW SOS REQUEST        │
├─────────────────────────────┤
│  Customer: John Doe         │
│  Phone: 1234567890          │
│  Vehicle: Toyota Camry 2020 │
│  Plate: ABC123              │
│  Distance: 5.2 km           │
│  Expires in: 58 seconds     │
│                             │
│  [ACCEPT]     [REJECT]      │
└─────────────────────────────┘
```

**Multiple Technicians Receive:**
- All technicians within 20km who are "Online" receive this
- First to accept gets the job (first-come-first-served)

---

## **STEP 7: Technician Accepts SOS** ✅

### **Method:** WebSocket Event

**Technician App Sends:**
```javascript
// When technician clicks "Accept" button
socket.emit('acceptSOS', {
  sos_id: '673sos789ghi012345678901',
  technician_id: '673xyz789abc012345678901'
});

console.log('📤 Acceptance sent');
```

**Data Structure:**
```json
{
  "sos_id": "673sos789ghi012345678901",
  "technician_id": "673xyz789abc012345678901"
}
```

**Technician App Listens for Confirmation:**
```javascript
socket.on('sosAcceptedConfirm', (data) => {
  console.log('✅ SOS ACCEPTED SUCCESSFULLY!');
  console.log('Job ID:', data.job_id);
  console.log('Customer:', data.customer);
  console.log('Vehicle:', data.vehicle);
  console.log('Location:', data.location);
  
  // Store job ID
  const jobId = data.job_id;
  
  // Navigate to job details/tracking screen
  navigateToJobTracking(data);
});
```

**Server Response to Technician:**
```json
{
  "sos_id": "673sos789ghi012345678901",
  "job_id": "673job123mno456789012345",
  "customer": {
    "id": "673abc123def456789012345",
    "name": "John Doe",
    "phone": "1234567890"
  },
  "vehicle": {
    "make": "Toyota",
    "model": "Camry",
    "year": 2020,
    "color": "Blue",
    "plate_number": "ABC123"
  },
  "location": {
    "latitude": 25.2048,
    "longitude": 55.2708
  }
}
```

**What Happens on Server:**
1. ✅ Updates SOSRequest status to "accepted"
2. ✅ **AUTO-CREATES JOB** with:
   - clientName: "John Doe"
   - clientMobileNumber: "1234567890"
   - issue: "SOS Emergency Request"
   - location: "25.2048, 55.2708"
   - assignedTechnician: technician_id
   - job_status: "assigned"
   - sos_request_id: sos_id
3. ✅ Updates technician status to "On Job"
4. ✅ Notifies customer (see Step 8)
5. ✅ Notifies other technicians SOS is taken

---

## **STEP 8: Customer Receives Acceptance Notification** 🎉

### **Method:** WebSocket Event (Automatic)

**Customer App Listens:**
```javascript
socket.on('sosAccepted', (data) => {
  console.log('🎉 TECHNICIAN ACCEPTED YOUR SOS!');
  console.log('Job ID:', data.job_id);
  console.log('Technician:', data.technician);
  console.log('Distance:', data.distance, 'km');
  
  // Store job ID
  const jobId = data.job_id;
  
  // Hide loading screen
  hideLoadingScreen();
  
  // Show success message
  showSuccessAlert(`${data.technician.name} accepted your request!`);
  
  // Navigate to tracking screen
  navigateToTechnicianTracking(data);
});
```

**Data Structure Received:**
```json
{
  "sos_id": "673sos789ghi012345678901",
  "job_id": "673job123mno456789012345",
  "technician": {
    "id": "673xyz789abc012345678901",
    "name": "Ahmed Ali",
    "phone": "9876543210",
    "profilePicture": "https://storage.com/tech123.jpg"
  },
  "distance": 5.2,
  "status": "assigned"
}
```

**Customer App UI:**
```
┌─────────────────────────────┐
│  ✅ Technician Found!       │
├─────────────────────────────┤
│  Name: Ahmed Ali            │
│  Phone: 9876543210          │
│  Distance: 5.2 km           │
│  Status: Assigned           │
│                             │
│  [VIEW ON MAP]              │
│  [CALL TECHNICIAN]          │
└─────────────────────────────┘
```

---

## **STEP 9: SOS Expiration (If No One Accepts)**

### **Method:** WebSocket Event (Automatic after 60 seconds)

**Customer App Listens:**
```javascript
socket.on('sosExpired', (data) => {
  console.log('⏰ SOS Request Expired');
  console.log('SOS ID:', data.sos_id);
  console.log('Reason:', data.message);
  
  // Hide loading screen
  hideLoadingScreen();
  
  // Show retry dialog
  showExpiredDialog({
    title: 'No Technicians Available',
    message: 'No technicians accepted your request within 60 seconds.',
    buttons: [
      { text: 'Try Again', action: () => createNewSOS() },
      { text: 'Cancel', action: () => goBack() }
    ]
  });
});
```

**Data Structure:**
```json
{
  "sos_id": "673sos789ghi012345678901",
  "message": "SOS request expired after 60 seconds"
}
```

---

## **STEP 10: Technician Updates Status to "En Route"** 🚗

### **Method:** WebSocket Event

**Technician App Sends:**
```javascript
// When technician starts driving to customer
const currentLat = 25.2100;
const currentLng = 55.2750;
const distanceToCustomer = calculateDistance(
  currentLat, currentLng,
  customerLat, customerLng
); // e.g., 4.8 km

socket.emit('updateJobStatus', {
  job_id: '673job123mno456789012345',
  status: 'en_route',
  customer_id: '673abc123def456789012345',
  latitude: currentLat,
  longitude: currentLng,
  distance: distanceToCustomer
});

console.log('🚗 Status updated: En Route');
```

**Data Structure:**
```json
{
  "job_id": "673job123mno456789012345",
  "status": "en_route",
  "customer_id": "673abc123def456789012345",
  "latitude": 25.2100,
  "longitude": 55.2750,
  "distance": 4.8
}
```

**Customer App Receives Update:**
```javascript
socket.on('jobStatusUpdate', (data) => {
  console.log('📍 Technician Location Update');
  console.log('Status:', data.status);
  console.log('Distance:', data.distance, 'km');
  console.log('Location:', data.technician_location);
  
  // Update map with technician's pin
  updateTechnicianMarker(
    data.technician_location.latitude,
    data.technician_location.longitude
  );
  
  // Update distance display
  updateDistanceText(`${data.distance} km away`);
  
  // Update status badge
  updateStatusBadge(data.status);
});
```

**Customer Receives:**
```json
{
  "job_id": "673job123mno456789012345",
  "status": "en_route",
  "distance": 4.8,
  "technician_location": {
    "latitude": 25.2100,
    "longitude": 55.2750
  }
}
```

**Customer App UI:**
```
┌─────────────────────────────┐
│  🚗 En Route                │
├─────────────────────────────┤
│  Ahmed Ali is driving       │
│  to your location           │
│                             │
│  📍 4.8 km away             │
│                             │
│  [MAP WITH PINS]            │
│  • Customer (You)           │
│  • Technician (Moving)      │
└─────────────────────────────┘
```

**Technician Continues Sending Updates:**
```javascript
// Continue sending status updates every 10-15 seconds while en_route
const trackingInterval = setInterval(() => {
  const currentLat = getCurrentLatitude();
  const currentLng = getCurrentLongitude();
  const distance = calculateDistance(currentLat, currentLng, customerLat, customerLng);
  
  socket.emit('updateJobStatus', {
    job_id: '673job123mno456789012345',
    status: 'en_route',
    customer_id: '673abc123def456789012345',
    latitude: currentLat,
    longitude: currentLng,
    distance: distance
  });
}, 15000); // Every 15 seconds
```

---

## **STEP 11: Technician Marks "Arrived"** 🎯

### **Method:** REST API (or WebSocket)

**Option A: REST API**

**Technician App Sends:**
```javascript
fetch('http://your-server.com/api/jobs/673job123mno456789012345/arrive', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + technicianToken,
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => {
  console.log('✅ Marked as Arrived');
  console.log(data);
  
  // Stop tracking interval
  clearInterval(trackingInterval);
  
  // Update UI
  updateStatusBadge('arrived');
});
```

**Server Returns:**
```json
{
  "message": "Technician arrived",
  "job_status": "arrived"
}
```

**Option B: WebSocket**

**Technician App Sends:**
```javascript
socket.emit('updateJobStatus', {
  job_id: '673job123mno456789012345',
  status: 'arrived',
  customer_id: '673abc123def456789012345',
  latitude: 25.2048,
  longitude: 55.2708,
  distance: 0
});
```

**Customer Receives Notification:**
```javascript
socket.on('jobStatusUpdate', (data) => {
  if (data.status === 'arrived') {
    console.log('🎯 Technician has arrived!');
    
    // Show alert
    showAlert('Technician has arrived at your location!');
    
    // Update UI
    updateStatusBadge('Arrived');
  }
});
```

**Customer App UI:**
```
┌─────────────────────────────┐
│  🎯 Technician Arrived!     │
├─────────────────────────────┤
│  Ahmed Ali is at your       │
│  location                   │
│                             │
│  [CALL TECHNICIAN]          │
└─────────────────────────────┘
```

---

## **STEP 12: Technician Starts Working** 🔧

### **Endpoint:** `POST /api/jobs/:id/start`

**Technician App Sends:**
```javascript
fetch('http://your-server.com/api/jobs/673job123mno456789012345/start', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + technicianToken
  }
})
.then(response => response.json())
.then(data => {
  console.log('🔧 Job Started');
  console.log(data);
  
  // Update UI - show repair procedure form
  showRepairProcedureScreen();
});
```

**Server Returns:**
```json
{
  "message": "Job started",
  "job_status": "in_progress"
}
```

**Customer Receives Update (via WebSocket - optional):**
```javascript
socket.on('jobStatusUpdate', (data) => {
  if (data.status === 'in_progress') {
    console.log('🔧 Work in progress');
    updateStatusBadge('In Progress');
  }
});
```

---

## **STEP 13: Technician Adds Repair Procedures** 🛠️

### **Endpoint:** `POST /api/jobs/:id/repairs`

**Technician can add multiple repair items**

**Repair Item 1 - Battery Replacement:**

**Technician App Sends:**
```javascript
fetch('http://your-server.com/api/jobs/673job123mno456789012345/repairs', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + technicianToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    description: 'Battery replacement',
    quantity: 1,
    price: 150,
    receipt_image_url: 'https://storage.com/receipts/battery123.jpg'
  })
})
.then(response => response.json())
.then(data => {
  console.log('✅ Repair added:', data);
});
```

**Request Data:**
```json
{
  "description": "Battery replacement",
  "quantity": 1,
  "price": 150,
  "receipt_image_url": "https://storage.com/receipts/battery123.jpg"
}
```

**Server Returns:**
```json
{
  "message": "Repair procedure added",
  "repair": {
    "id": "673rep1abc234def567890ab",
    "job_id": "673job123mno456789012345",
    "description": "Battery replacement",
    "quantity": 1,
    "price": 150,
    "receipt_image_url": "https://storage.com/receipts/battery123.jpg",
    "createdAt": "2025-10-29T10:15:00Z"
  }
}
```

**Repair Item 2 - Labor:**

**Technician App Sends:**
```javascript
fetch('http://your-server.com/api/jobs/673job123mno456789012345/repairs', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + technicianToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    description: 'Labor - Battery installation',
    quantity: 1,
    price: 50
  })
})
.then(response => response.json())
.then(data => {
  console.log('✅ Labor added:', data);
});
```

**Technician App Can Add Multiple Items:**
- Parts (with receipt photos)
- Labor charges
- Additional services

---

## **STEP 14: Calculate Total Price** 💰

### **Endpoint:** `GET /api/jobs/:id/total`

**Technician App Requests Total:**
```javascript
fetch('http://your-server.com/api/jobs/673job123mno456789012345/total', {
  headers: {
    'Authorization': 'Bearer ' + technicianToken
  }
})
.then(response => response.json())
.then(data => {
  console.log('💰 Total Calculation:', data);
  
  // Display breakdown to technician
  displayPriceBreakdown(data);
});
```

**Server Returns:**
```json
{
  "total": 210,
  "basePrice": 0,
  "distanceFee": 10,
  "timeFee": 0,
  "repairsTotal": 200,
  "breakdown": {
    "distance": "5.2 km × $2/km = $10",
    "repairs": [
      {
        "description": "Battery replacement",
        "quantity": 1,
        "price": 150,
        "subtotal": 150
      },
      {
        "description": "Labor - Battery installation",
        "quantity": 1,
        "price": 50,
        "subtotal": 50
      }
    ]
  }
}
```

**Technician App UI:**
```
┌─────────────────────────────┐
│  💰 Price Breakdown         │
├─────────────────────────────┤
│  Battery replacement  $150  │
│  Labor                 $50  │
│  Distance (5.2km)      $10  │
│  ───────────────────────    │
│  TOTAL                $210  │
│                             │
│  [COMPLETE JOB]             │
└─────────────────────────────┘
```

**Customer Can Also Check Total:**
```javascript
// Customer App
fetch('http://your-server.com/api/jobs/673job123mno456789012345/total', {
  headers: {
    'Authorization': 'Bearer ' + customerToken
  }
})
.then(response => response.json())
.then(data => {
  displayPriceToCustomer(data.total);
});
```

---

## **STEP 15: Mark Job as Completed** ✅

### **Endpoint:** `POST /api/jobs/:id/complete`

**Technician App Sends:**
```javascript
fetch('http://your-server.com/api/jobs/673job123mno456789012345/complete', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + technicianToken
  }
})
.then(response => response.json())
.then(data => {
  console.log('✅ Job Completed:', data);
  
  // Navigate to payment screen
  navigateToPaymentScreen();
});
```

**Server Returns:**
```json
{
  "message": "Job completed",
  "job_status": "completed"
}
```

**What Happens on Server:**
1. ✅ Updates job status to "completed"
2. ✅ Auto-updates technician earnings
3. ✅ Updates technician performance metrics
4. ✅ Technician remains "On Job" until payment confirmed

**Customer Receives Notification:**
```javascript
socket.on('jobStatusUpdate', (data) => {
  if (data.status === 'completed') {
    console.log('✅ Job completed!');
    
    // Show completion dialog
    showJobCompletionDialog({
      message: 'Your vehicle is ready!',
      total: '$210'
    });
  }
});
```

---

## **STEP 16: Confirm Payment & Generate Receipt** 💵

### **Endpoint:** `POST /api/jobs/:id/payment`

**Technician App Sends:**
```javascript
fetch('http://your-server.com/api/jobs/673job123mno456789012345/payment', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + technicianToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    notes: 'Cash payment received'
  })
})
.then(response => response.json())
.then(data => {
  console.log('💵 Payment Confirmed:', data);
  
  // Show receipt
  displayReceipt(data.receipt);
  
  // Navigate back to dashboard
  navigateBackToDashboard();
});
```

**Request Data:**
```json
{
  "notes": "Cash payment received"
}
```

**Server Returns:**
```json
{
  "message": "Payment confirmed and receipt generated",
  "receipt": {
    "receipt_id": "673rec789pqr012345678901",
    "receipt_number": "REC-2025-001234",
    "job_id": "673job123mno456789012345",
    "customer_id": "673abc123def456789012345",
    "technician_id": "673xyz789abc012345678901",
    "total_amount": 210,
    "items": [
      {
        "description": "Battery replacement",
        "quantity": 1,
        "price": 150
      },
      {
        "description": "Labor - Battery installation",
        "quantity": 1,
        "price": 50
      },
      {
        "description": "Distance fee (5.2 km)",
        "quantity": 1,
        "price": 10
      }
    ],
    "payment_method": "cash",
    "notes": "Cash payment received",
    "created_at": "2025-10-29T10:30:00Z"
  },
  "job_status": "paid"
}
```

**What Happens on Server:**
1. ✅ Updates job status to "paid"
2. ✅ Auto-generates receipt
3. ✅ **Updates technician status back to "Online"**
4. ✅ Technician can now receive new SOS requests
5. ✅ Customer receives receipt

**Technician App UI:**
```
┌─────────────────────────────┐
│  ✅ Payment Confirmed       │
├─────────────────────────────┤
│  Receipt: REC-2025-001234   │
│  Amount: $210               │
│  Method: Cash               │
│                             │
│  [VIEW RECEIPT]             │
│  [BACK TO DASHBOARD]        │
└─────────────────────────────┘
```

---

## **STEP 17: Customer Rates the Job** ⭐

### **Endpoint:** `POST /api/jobs/:id/rate`

**Customer App Sends:**
```javascript
fetch('http://your-server.com/api/jobs/673job123mno456789012345/rate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + customerToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    rating: 5,
    rating_description: 'Excellent service! Ahmed was very professional and fixed my car battery quickly. Highly recommend!'
  })
})
.then(response => response.json())
.then(data => {
  console.log('⭐ Rating submitted:', data);
  
  // Show thank you message
  showThankYouDialog();
});
```

**Request Data:**
```json
{
  "rating": 5,
  "rating_description": "Excellent service! Ahmed was very professional and fixed my car battery quickly. Highly recommend!"
}
```

**Server Returns:**
```json
{
  "message": "Job rated successfully",
  "rating": 5,
  "rating_description": "Excellent service! Ahmed was very professional and fixed my car battery quickly. Highly recommend!"
}
```

**Customer App UI:**
```
┌─────────────────────────────┐
│  ⭐ Rate This Service       │
├─────────────────────────────┤
│  How was Ahmed Ali?         │
│                             │
│  ★ ★ ★ ★ ★                 │
│                             │
│  ┌───────────────────────┐ │
│  │ Write a review...     │ │
│  │                       │ │
│  └───────────────────────┘ │
│                             │
│  [SUBMIT RATING]            │
└─────────────────────────────┘
```

---

## **STEP 18: View Receipt (Optional)**

### **Endpoint:** `GET /api/receipts/:id`

**Customer/Technician App Requests:**
```javascript
fetch('http://your-server.com/api/receipts/673rec789pqr012345678901', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
})
.then(response => response.json())
.then(data => {
  console.log('📄 Receipt:', data);
  displayReceipt(data.receipt);
});
```

**Server Returns:**
```json
{
  "receipt": {
    "receipt_id": "673rec789pqr012345678901",
    "receipt_number": "REC-2025-001234",
    "customer": {
      "name": "John Doe",
      "phone": "1234567890"
    },
    "technician": {
      "name": "Ahmed Ali",
      "phone": "9876543210"
    },
    "vehicle": {
      "make": "Toyota",
      "model": "Camry",
      "plate_number": "ABC123"
    },
    "items": [
      {
        "description": "Battery replacement",
        "quantity": 1,
        "price": 150
      },
      {
        "description": "Labor - Battery installation",
        "quantity": 1,
        "price": 50
      },
      {
        "description": "Distance fee (5.2 km)",
        "quantity": 1,
        "price": 10
      }
    ],
    "total_amount": 210,
    "payment_method": "cash",
    "created_at": "2025-10-29T10:30:00Z"
  }
}
```

### **Download PDF Receipt:** `GET /api/receipts/:id/download`

```javascript
// Downloads PDF file
window.open(`http://your-server.com/api/receipts/673rec789pqr012345678901/download?token=${token}`);
```

---

## 📊 Complete Flow Summary Table

| Step | Action | App | Method | Endpoint/Event | Data Sent | Data Received |
|------|--------|-----|--------|----------------|-----------|---------------|
| 1 | Login | Customer | REST | `POST /api/customers/login` | phone, password | token, customer info |
| 2 | Login | Technician | REST | `POST /api/technicians/login` | phone, password | token, technician info |
| 3 | Go Online | Technician | REST | `PATCH /api/technicians/status` | status: "Online" | status confirmed |
| 4 | Send Location | Technician | WebSocket | `emit('updateLocation')` | lat, lng | (no response) |
| 5 | Create SOS | Customer | WebSocket | `emit('createSOS')` | vehicle_id, lat, lng | sos_id, expiresAt |
| 6 | Receive SOS | Technician | WebSocket | `on('newSOSRequest')` | - | sos details, distance |
| 7 | Accept SOS | Technician | WebSocket | `emit('acceptSOS')` | sos_id | job_id, customer info |
| 8 | Get Acceptance | Customer | WebSocket | `on('sosAccepted')` | - | job_id, technician info |
| 9 | En Route | Technician | WebSocket | `emit('updateJobStatus')` | status: "en_route", lat, lng | (no response) |
| 10 | Track Location | Customer | WebSocket | `on('jobStatusUpdate')` | - | status, distance, location |
| 11 | Mark Arrived | Technician | REST | `POST /api/jobs/:id/arrive` | - | job_status: "arrived" |
| 12 | Start Job | Technician | REST | `POST /api/jobs/:id/start` | - | job_status: "in_progress" |
| 13 | Add Repairs | Technician | REST | `POST /api/jobs/:id/repairs` | description, quantity, price | repair details |
| 14 | Get Total | Technician | REST | `GET /api/jobs/:id/total` | - | total, breakdown |
| 15 | Complete Job | Technician | REST | `POST /api/jobs/:id/complete` | - | job_status: "completed" |
| 16 | Confirm Payment | Technician | REST | `POST /api/jobs/:id/payment` | notes | receipt, job_status: "paid" |
| 17 | Rate Job | Customer | REST | `POST /api/jobs/:id/rate` | rating, description | success message |
| 18 | View Receipt | Both | REST | `GET /api/receipts/:id` | - | receipt details |

---

## 🔐 Authentication Summary

### **All REST API Calls Require:**
```javascript
headers: {
  'Authorization': 'Bearer ' + token
}
```

### **WebSocket Connections Require:**
```javascript
io('http://server.com/namespace', {
  auth: {
    token: jwtToken
  }
});
```

---

## 🎯 Key Points

1. **WebSocket for Real-Time:** SOS creation, acceptance, and tracking use WebSocket
2. **REST for CRUD:** Job management, repairs, payment use REST APIs
3. **Auto Job Creation:** Server creates job automatically when technician accepts SOS
4. **Status Management:** Technician status changes: "Online" → "On Job" → "Online"
5. **60-Second Window:** SOS expires if not accepted within 60 seconds
6. **Live Location:** Technician sends location every 5-10 seconds
7. **First-Come-First-Served:** First technician to accept gets the job

---

## 🚀 Implementation Checklist

### **Customer App:**
- [ ] Socket.IO client installed
- [ ] WebSocket connection to `/customer` namespace
- [ ] GPS permission and location tracking
- [ ] Event handlers: `sosCreated`, `sosAccepted`, `sosExpired`, `jobStatusUpdate`
- [ ] Map integration for tracking
- [ ] Rating screen after job completion

### **Technician App:**
- [ ] Socket.IO client installed
- [ ] WebSocket connection to `/technician` namespace
- [ ] GPS permission and continuous location tracking
- [ ] Event handlers: `newSOSRequest`, `sosAcceptedConfirm`, `sosAlreadyAccepted`
- [ ] Repair procedure forms
- [ ] Receipt display

### **Backend:**
- [x] Socket.IO server configured
- [x] WebSocket authentication
- [x] SOS broadcasting logic
- [x] Auto job creation
- [x] Distance calculation
- [x] Receipt generation

---

## 📞 Support

For issues or questions:
- Create a support ticket: `POST /api/support/tickets`
- Contact us: `POST /api/contact-us`

---

**Document Version:** 1.0  
**Last Updated:** October 29, 2025  
**Server URL:** `http://your-server.com` (Replace with actual server URL)
