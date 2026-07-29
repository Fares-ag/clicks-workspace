# SOS System - Simple URL & Endpoint Guide

**Server IP:** `http://20.189.121.64:5001`

---

## 🚨 **SOS Flow - URLs & Endpoints**

### **Step 1: Customer Creates SOS**

**Customer App connects to:**
```
ws://20.189.121.64:5001/customer
```

**Customer sends:**
```javascript
socket.emit('createSOS', {
  customer_id: "673abc123",
  customer_vehicle_id: "673veh456",
  latitude: 25.2048,
  longitude: 55.2708
});
```

**Customer receives back:**
```javascript
socket.on('sosCreated', (data) => {
  // { sos_id: "673sos789", status: "pending", expiresAt: "..." }
});
```

---

### **Step 2: Technician Receives SOS**

**Technician App connects to:**
```
ws://20.189.121.64:5001/technician
```

**Technician receives automatically:**
```javascript
socket.on('newSOSRequest', (data) => {
  // {
  //   sos_id: "673sos789",
  //   customer_name: "John Doe",
  //   customer_phone: "1234567890",
  //   vehicle: { make: "Toyota", model: "Camry" },
  //   latitude: 25.2048,
  //   longitude: 55.2708,
  //   distance: 5.2,
  //   expires_at: "..."
  // }
});
```

**How?** Server automatically broadcasts to all technicians within 20km who are "Online"

---

### **Step 3: Technician Accepts SOS**

**Technician sends:**
```javascript
socket.emit('acceptSOS', {
  sos_id: "673sos789",
  technician_id: "673xyz789"
});
```

**Technician receives:**
```javascript
socket.on('sosAcceptedConfirm', (data) => {
  // { job_id: "673job123", customer: {...}, vehicle: {...} }
});
```

**Customer receives:**
```javascript
socket.on('sosAccepted', (data) => {
  // { job_id: "673job123", technician: {...}, distance: 5.2 }
});
```

**What happens:** Server auto-creates a Job

---

### **Step 4: Technician Updates Location (While Driving)**

**Technician sends (every 5-10 seconds):**
```javascript
socket.emit('updateJobStatus', {
  job_id: "673job123",
  status: "en_route",
  customer_id: "673abc123",
  latitude: 25.2100,
  longitude: 55.2750,
  distance: 4.5
});
```

**Customer receives:**
```javascript
socket.on('jobStatusUpdate', (data) => {
  // { status: "en_route", distance: 4.5, technician_location: {...} }
});
```

---

### **Step 5: Technician Arrives**

**URL:**
```
POST http://20.189.121.64:5001/api/jobs/673job123/arrive
Authorization: Bearer {technician_token}
```

**Response:**
```json
{ "message": "Technician arrived", "job_status": "arrived" }
```

---

### **Step 6: Start Job**

**URL:**
```
POST http://20.189.121.64:5001/api/jobs/673job123/start
Authorization: Bearer {technician_token}
```

**Response:**
```json
{ "message": "Job started", "job_status": "in_progress" }
```

---

### **Step 7: Add Repairs**

**URL:**
```
POST http://20.189.121.64:5001/api/jobs/673job123/repairs
Authorization: Bearer {technician_token}
Content-Type: application/json
```

**Body:**
```json
{
  "description": "Battery replacement",
  "quantity": 1,
  "price": 150,
  "receipt_image_url": "https://..."
}
```

**Response:**
```json
{ "message": "Repair procedure added", "repair": {...} }
```

---

### **Step 8: Calculate Total**

**URL:**
```
GET http://20.189.121.64:5001/api/jobs/673job123/total
Authorization: Bearer {technician_token}
```

**Response:**
```json
{
  "total": 210,
  "basePrice": 0,
  "distanceFee": 10,
  "repairsTotal": 200
}
```

---

### **Step 9: Complete Job**

**URL:**
```
POST http://20.189.121.64:5001/api/jobs/673job123/complete
Authorization: Bearer {technician_token}
```

**Response:**
```json
{ "message": "Job completed", "job_status": "completed" }
```

---

### **Step 10: Confirm Payment**

**URL:**
```
POST http://20.189.121.64:5001/api/jobs/673job123/payment
Authorization: Bearer {technician_token}
Content-Type: application/json
```

**Body:**
```json
{
  "notes": "Cash payment received"
}
```

**Response:**
```json
{
  "message": "Payment confirmed and receipt generated",
  "receipt": {
    "receipt_id": "673rec789",
    "receipt_number": "REC-2025-001234",
    "total_amount": 210
  },
  "job_status": "paid"
}
```

---

### **Step 11: Customer Rates Job**

**URL:**
```
POST http://20.189.121.64:5001/api/jobs/673job123/rate
Authorization: Bearer {customer_token}
Content-Type: application/json
```

**Body:**
```json
{
  "rating": 5,
  "rating_description": "Excellent service!"
}
```

**Response:**
```json
{
  "message": "Job rated successfully",
  "rating": 5,
  "rating_description": "Excellent service!"
}
```

---

## 📋 **Quick Summary**

| Step | Who | Type | URL/Event |
|------|-----|------|-----------|
| 1 | Customer | WebSocket | `ws://20.189.121.64:5001/customer` → emit `createSOS` |
| 2 | Technician | WebSocket | `ws://20.189.121.64:5001/technician` → receives `newSOSRequest` |
| 3 | Technician | WebSocket | emit `acceptSOS` |
| 4 | Technician | WebSocket | emit `updateJobStatus` (loop) |
| 5 | Technician | REST | `POST /api/jobs/:id/arrive` |
| 6 | Technician | REST | `POST /api/jobs/:id/start` |
| 7 | Technician | REST | `POST /api/jobs/:id/repairs` (multiple times) |
| 8 | Technician | REST | `GET /api/jobs/:id/total` |
| 9 | Technician | REST | `POST /api/jobs/:id/complete` |
| 10 | Technician | REST | `POST /api/jobs/:id/payment` |
| 11 | Customer | REST | `POST /api/jobs/:id/rate` |

---

## 🔑 **Key Points**

**WebSocket URLs:**
- Customer: `ws://20.189.121.64:5001/customer`
- Technician: `ws://20.189.121.64:5001/technician`

**How technician receives SOS:**
- Server automatically broadcasts to `on('newSOSRequest')` event
- Only technicians within 20km who are "Online" receive it
- Technician listens to the event, doesn't call any URL

**REST API Base:**
- All REST endpoints: `http://20.189.121.64:5001/api/...`

**Authentication:**
- WebSocket: Include in connection: `auth: { token: jwt }`
- REST: Header: `Authorization: Bearer {token}`

That's it! 🚀
