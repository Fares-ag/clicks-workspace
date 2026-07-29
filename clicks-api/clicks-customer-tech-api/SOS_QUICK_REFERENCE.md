# SOS System - Quick Reference Guide

## 🚀 Quick Start

### **Customer App - Minimum Implementation**

```javascript
// 1. Setup
import io from 'socket.io-client';
const socket = io('http://server.com/customer', { 
  auth: { token: customerToken } 
});

// 2. Register
socket.emit('register', customerId);

// 3. Create SOS
socket.emit('createSOS', {
  customer_id: customerId,
  customer_vehicle_id: vehicleId,
  latitude: 25.2048,
  longitude: 55.2708
});

// 4. Listen for updates
socket.on('sosCreated', (data) => { /* SOS created */ });
socket.on('sosAccepted', (data) => { /* Technician accepted */ });
socket.on('sosExpired', (data) => { /* No technicians */ });
socket.on('jobStatusUpdate', (data) => { /* Live tracking */ });
```

### **Technician App - Minimum Implementation**

```javascript
// 1. Setup
import io from 'socket.io-client';
const socket = io('http://server.com/technician', { 
  auth: { token: technicianToken } 
});

// 2. Register
socket.emit('register', technicianId);

// 3. Send location (every 5 seconds)
setInterval(() => {
  socket.emit('updateLocation', {
    technician_id: technicianId,
    latitude: currentLat,
    longitude: currentLng
  });
}, 5000);

// 4. Listen for SOS
socket.on('newSOSRequest', (data) => {
  // Show notification + Accept button
});

// 5. Accept SOS
socket.emit('acceptSOS', {
  sos_id: sosId,
  technician_id: technicianId
});

// 6. Update status
socket.emit('updateJobStatus', {
  job_id: jobId,
  status: 'en_route',
  customer_id: customerId,
  latitude: currentLat,
  longitude: currentLng,
  distance: distanceKm
});
```

---

## 📋 Complete Endpoint Reference

### **WebSocket Events**

#### **Customer Namespace** (`/customer`)

| Direction | Event | Data | Description |
|-----------|-------|------|-------------|
| Emit | `register` | `customerId` | Register connection |
| Emit | `createSOS` | `customer_id, customer_vehicle_id, latitude, longitude` | Create SOS request |
| Emit | `cancelSOS` | `sos_id, reason` | Cancel pending SOS |
| Listen | `sosCreated` | `sos_id, expiresAt` | SOS created confirmation |
| Listen | `sosAccepted` | `job_id, technician, distance` | Technician accepted |
| Listen | `sosExpired` | `sos_id, message` | SOS expired (60s) |
| Listen | `jobStatusUpdate` | `job_id, status, distance, technician_location` | Live updates |

#### **Technician Namespace** (`/technician`)

| Direction | Event | Data | Description |
|-----------|-------|------|-------------|
| Emit | `register` | `technicianId` | Register connection |
| Emit | `updateLocation` | `technician_id, latitude, longitude` | Send location |
| Emit | `acceptSOS` | `sos_id, technician_id` | Accept SOS request |
| Emit | `updateJobStatus` | `job_id, status, customer_id, latitude, longitude, distance` | Update job status |
| Listen | `newSOSRequest` | `sos_id, customer, vehicle, location, distance, expires_at` | New SOS broadcast |
| Listen | `sosAcceptedConfirm` | `job_id, customer, vehicle, location` | Acceptance confirmed |
| Listen | `sosAlreadyAccepted` | `sos_id, message` | SOS taken by another |

---

### **REST API Endpoints**

#### **Authentication**
```
POST   /api/customers/login          → { phone_number, password }
POST   /api/technicians/login        → { phone, password }
```

#### **Technician Status**
```
PATCH  /api/technicians/status       → { status: "Online" }
```

#### **Job Management**
```
POST   /api/jobs/:id/arrive          → Mark arrived
POST   /api/jobs/:id/start           → Start job (in_progress)
POST   /api/jobs/:id/repairs         → Add repair item
GET    /api/jobs/:id/total           → Calculate total price
POST   /api/jobs/:id/complete        → Mark completed
POST   /api/jobs/:id/payment         → Confirm payment + generate receipt
POST   /api/jobs/:id/rate            → Customer rates job
```

#### **History & Details**
```
GET    /api/sos/                     → Customer SOS history
GET    /api/sos/:id                  → Specific SOS details
GET    /api/jobs/customer/history    → Customer job history
GET    /api/jobs/:id                 → Job details
GET    /api/receipts/:id             → View receipt
GET    /api/receipts/:id/download    → Download PDF
```

---

## 🔄 Job Status Flow

```
pending (initial)
    ↓
assigned (SOS accepted - auto-created)
    ↓
en_route (technician traveling)
    ↓
arrived (technician at location)
    ↓
in_progress (working on vehicle)
    ↓
completed (work finished)
    ↓
paid (payment confirmed + receipt generated)
    ↓
[Customer can rate]
```

---

## 💰 Price Calculation Formula

```javascript
Total = basePrice + distanceFee + timeFee + repairsTotal

Where:
- basePrice: Fixed base charge (if any)
- distanceFee: distance_km × $2/km
- timeFee: Surcharge for night/weekend (if applicable)
- repairsTotal: Sum of all repair items
```

**Example:**
```
Base Price:      $0
Distance (5km):  $10  (5 × $2)
Time Surcharge:  $0
Battery:         $150
Labor:           $50
─────────────────────
TOTAL:           $210
```

---

## ⏰ Important Timings

| Event | Timing |
|-------|--------|
| SOS Expiration | 60 seconds |
| Location Updates (Technician) | Every 5-10 seconds |
| Status Updates (En Route) | Every 10-15 seconds |
| Technician Search Radius | 20 km |

---

## 🎯 Technician Status States

| Status | Description | Can Receive SOS? |
|--------|-------------|------------------|
| `Offline` | Not available | ❌ No |
| `Online` | Available for jobs | ✅ Yes |
| `On Job` | Currently working | ❌ No |

**Flow:** `Offline` → `Online` → `On Job` (SOS accepted) → `Online` (payment confirmed)

---

## 🚨 Error Handling

### **Common Errors**

```javascript
// SOS expired
socket.on('sosExpired', (data) => {
  // Show: "No technicians available. Try again?"
});

// SOS already accepted
socket.on('sosAlreadyAccepted', (data) => {
  // Show: "This request was accepted by another technician"
});

// Connection error
socket.on('connect_error', (error) => {
  // Show: "Connection failed. Check internet."
});

// Job not found
// Response: { error: "Job not found" }

// Invalid rating
// Response: { error: "Rating must be between 1 and 5" }
```

---

## 📱 UI/UX Recommendations

### **Customer App**

**SOS Screen:**
```
┌─────────────────────┐
│  🆘 EMERGENCY       │
│                     │
│  [SOS BUTTON]       │
│  (Big, Red)         │
│                     │
│  Your Location:     │
│  📍 25.2048, 55.27  │
└─────────────────────┘
```

**After SOS Created:**
```
┌─────────────────────┐
│  🔍 Finding Help    │
│  ⏰ 58 seconds left │
│  Broadcasting...    │
│  [CANCEL]           │
└─────────────────────┘
```

**Tracking Screen:**
```
┌─────────────────────┐
│  🚗 Ahmed Ali       │
│  📱 9876543210      │
│  📍 4.8 km away     │
│                     │
│  [MAP VIEW]         │
│  • You (Customer)   │
│  • Technician       │
│                     │
│  [CALL] [CANCEL]    │
└─────────────────────┘
```

### **Technician App**

**SOS Notification:**
```
┌─────────────────────┐
│  🚨 NEW REQUEST     │
│  John Doe           │
│  Toyota Camry 2020  │
│  📍 5.2 km away     │
│  ⏰ 58 sec          │
│                     │
│  [ACCEPT] [REJECT]  │
└─────────────────────┘
```

**Repair Entry:**
```
┌─────────────────────┐
│  🛠️ Add Repair      │
│  Description:       │
│  [Battery...]       │
│  Quantity: [1]      │
│  Price: [$150]      │
│  📷 [Add Receipt]   │
│  [SAVE]             │
└─────────────────────┘
```

---

## 🔐 Security Checklist

- [ ] JWT tokens in all requests
- [ ] Validate user owns the resource (job, SOS)
- [ ] Check job status before transitions
- [ ] Verify technician is "Online" before SOS broadcast
- [ ] Rate limiting on SOS creation (prevent spam)
- [ ] Sanitize location data
- [ ] Secure WebSocket connections (wss://)

---

## 🧪 Testing Checklist

### **Customer App:**
- [ ] Create SOS with valid location
- [ ] Receive acceptance notification
- [ ] Track technician location on map
- [ ] View job details
- [ ] Rate completed job
- [ ] View receipt

### **Technician App:**
- [ ] Go online/offline
- [ ] Receive SOS notification
- [ ] Accept SOS
- [ ] Update location continuously
- [ ] Mark arrived
- [ ] Add repair items
- [ ] Confirm payment
- [ ] View earnings

### **Edge Cases:**
- [ ] SOS expires (no acceptance)
- [ ] Multiple technicians accept (first wins)
- [ ] Network disconnection during SOS
- [ ] App killed during active job
- [ ] Invalid/stale tokens

---

## 📊 Data Models Reference

### **SOSRequest**
```javascript
{
  _id: ObjectId,
  customer_id: ObjectId,
  customer_vehicle_id: ObjectId,
  location: { type: "Point", coordinates: [lng, lat] },
  status: "pending|accepted|expired|cancelled",
  assigned_technician_id: ObjectId,
  job_id: ObjectId,
  expires_at: Date,
  created_at: Date
}
```

### **Job**
```javascript
{
  _id: ObjectId,
  clientName: String,
  clientMobileNumber: String,
  customer_id: ObjectId,
  assignedTechnician: ObjectId,
  sos_request_id: ObjectId,
  job_status: "assigned|en_route|arrived|in_progress|completed|paid",
  price: Number,
  rating: Number (1-5),
  rating_description: String,
  created_at: Date
}
```

### **Receipt**
```javascript
{
  _id: ObjectId,
  receipt_number: String,
  job_id: ObjectId,
  customer_id: ObjectId,
  technician_id: ObjectId,
  total_amount: Number,
  items: Array,
  payment_method: String,
  created_at: Date
}
```

---

## 🚀 Performance Tips

1. **Batch Location Updates:** Send every 5-10 seconds, not constantly
2. **Cache Job Data:** Store job details locally to reduce API calls
3. **Lazy Load History:** Paginate job history
4. **Optimize Images:** Compress receipt images before upload
5. **WebSocket Reconnection:** Auto-reconnect on disconnect
6. **Background Location:** Continue tracking when app is backgrounded

---

## 📞 Support

**Documentation:**
- Full Flow Guide: `SOS_COMPLETE_FLOW_GUIDE.md`
- System Documentation: `SOS_SYSTEM_DOCUMENTATION.md`
- Postman Collection: `Clicks-API-Postman-Collection.json`

**Issues:**
- Backend: Check server logs
- WebSocket: Verify namespace and auth
- REST API: Check token validity

---

**Version:** 1.0  
**Last Updated:** October 29, 2025
