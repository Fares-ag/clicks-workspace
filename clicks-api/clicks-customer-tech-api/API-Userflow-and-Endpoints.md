# Clicks API: User Flow & Endpoint Documentation

## 📚 Documentation Files

**Main Documentation:**
- **`Clicks-API-Postman-Collection.json`** - Complete Postman collection (56 endpoints)
- **`SOS_COMPLETE_FLOW_GUIDE.md`** - 🆕 Complete SOS system implementation guide
- **`SOS_QUICK_REFERENCE.md`** - 🆕 Quick reference for SOS implementation
- **`SOS_SYSTEM_DOCUMENTATION.md`** - WebSocket events and system architecture

**Import `Clicks-API-Postman-Collection.json` into Postman to access every endpoint.**

---

## User Flows & Endpoints

### Customer Flow
1. **Register/Login**
   - `POST /customer/register`
   - `POST /customer/login`
2. **Profile Management**
   - `GET /customer/profile`
   - `PUT /customer/profile`
   - `POST /customer/update-password`
   - `POST /customer/delete`
3. **Vehicle Management**
   - `POST /vehicle/`
   - `GET /vehicle/`
   - `PUT /vehicle/:id`
   - `DELETE /vehicle/:id`
   - `GET /vehicle/makes`
   - `GET /vehicle/models`
   - `GET /vehicle/types`
4. **SOS Request** (WebSocket + REST)
   - **WebSocket:** `emit('createSOS')` - Create SOS with lat/lng
   - **WebSocket:** `on('sosCreated')` - SOS created confirmation
   - **WebSocket:** `on('sosAccepted')` - Technician accepted
   - **WebSocket:** `on('sosExpired')` - No technicians (60s timeout)
   - **WebSocket:** `on('jobStatusUpdate')` - Live tracking
   - `GET /api/sos/` - View SOS history
   - `GET /api/sos/:id` - View specific SOS details
   - 📖 **See `SOS_COMPLETE_FLOW_GUIDE.md` for full implementation**
5. **Job Management**
   - `POST /job/`
   - `GET /job/customer/history`
   - `GET /job/:id`
   - `POST /job/:id/rate`
   - `POST /job/:id/payment`
   - `GET /job/:id/total`
   - `GET /job/technicians/nearby`
6. **Support**
   - `POST /support/tickets`
   - `GET /support/tickets`
   - `GET /support/types`

### Technician Flow
1. **Register/Login**
   - `POST /api/technicians/register`
   - `POST /api/technicians/login`
2. **Dashboard/Status**
   - `GET /api/technicians/dashboard`
   - `PATCH /api/technicians/status` - Toggle Online/Offline
   - `GET /api/technicians/application-status`
3. **SOS System** (WebSocket + REST)
   - **WebSocket:** `emit('updateLocation')` - Send location every 5-10s
   - **WebSocket:** `on('newSOSRequest')` - Receive SOS notifications
   - **WebSocket:** `emit('acceptSOS')` - Accept SOS request
   - **WebSocket:** `on('sosAcceptedConfirm')` - Acceptance confirmed
   - **WebSocket:** `emit('updateJobStatus')` - Update job status & location
   - `GET /api/sos/technician/history` - View SOS history
   - 📖 **See `SOS_COMPLETE_FLOW_GUIDE.md` for full implementation**
4. **Job Management**
   - `GET /api/technicians/jobs`
   - `POST /api/technicians/jobs/:id/accept`
   - `POST /api/technicians/jobs/:id/reject`
   - `POST /api/jobs/:id/arrive` - Mark arrived
   - `POST /api/jobs/:id/start` - Start job
   - `POST /api/jobs/:id/complete` - Mark completed
   - `POST /api/jobs/:id/payment` - Confirm payment
5. **Repair Procedures**
   - `POST /api/repairs/` (file upload: receipt_image)
   - `GET /api/repairs/`
   - `PUT /api/repairs/:id`
   - `DELETE /api/repairs/:id`
   - `POST /api/jobs/:id/repairs` - Add repair to job
   - `GET /api/jobs/:id/total` - Calculate total price
6. **Analytics**
   - `GET /api/analytics/earnings`
   - `GET /api/analytics/performance`
   - `GET /api/analytics/weekly`
   - `GET /api/analytics/jobs`

### SOS-to-Job Flow
**Automatic Job Creation:**
- When technician accepts SOS via WebSocket, server automatically creates Job
- Job status starts as "assigned"
- No manual conversion needed
- 📖 **See `SOS_COMPLETE_FLOW_GUIDE.md` for complete flow**

### Payment & Receipt
- `POST /api/jobs/:id/payment` - Confirm payment & auto-generate receipt
- `POST /api/receipts/` - Manually generate receipt
- `GET /api/receipts/:id` - View receipt
- `GET /api/receipts/:id/download` - Download PDF receipt

### Customer Rating
- `POST /api/jobs/:id/rate` - Rate job (1-5 stars + description)

---

## 🔌 WebSocket Integration

### **Customer App:**
```javascript
const socket = io('http://server.com/customer', { auth: { token } });
socket.emit('createSOS', { customer_id, customer_vehicle_id, latitude, longitude });
socket.on('sosAccepted', (data) => { /* Track technician */ });
```

### **Technician App:**
```javascript
const socket = io('http://server.com/technician', { auth: { token } });
socket.emit('updateLocation', { technician_id, latitude, longitude });
socket.on('newSOSRequest', (data) => { /* Show notification */ });
socket.emit('acceptSOS', { sos_id, technician_id });
```

📖 **Full WebSocket documentation:** `SOS_COMPLETE_FLOW_GUIDE.md`

---

## 📁 File Uploads

### **Technician Registration:**
- `POST /api/technicians/register` (multipart/form-data)
  - `profilePicture` (file)
  - `licenseFront` (file)
  - `licenseBack` (file)
  - `permitFront` (file)
  - `permitBack` (file)

### **Repair Procedures:**
- `POST /api/repairs/` (multipart/form-data)
  - `receipt_image` (file)

---

## 🚀 How to Use

1. **Import Postman Collection:**
   - Import `Clicks-API-Postman-Collection.json` into Postman
   - Set environment variables: `base_url`, `customer_token`, `technician_token`

2. **Read Implementation Guides:**
   - **Complete SOS Flow:** `SOS_COMPLETE_FLOW_GUIDE.md` (18 steps with code examples)
   - **Quick Reference:** `SOS_QUICK_REFERENCE.md` (Summary tables)
   - **WebSocket Events:** `SOS_SYSTEM_DOCUMENTATION.md` (Architecture)

3. **Test Endpoints:**
   - Use Postman collection for REST APIs
   - Use Socket.IO client for WebSocket testing

---

## 📊 System Overview

**Total Endpoints:** 56 (11 WebSocket events + 45 REST endpoints)

**Customer Features:**
- Authentication & Profile
- Vehicle Management (7 endpoints)
- SOS Emergency System (WebSocket)
- Job History & Tracking
- Rating & Feedback
- Support Tickets

**Technician Features:**
- Authentication & Registration
- Status Management (Online/Offline)
- SOS Acceptance (WebSocket)
- Live Location Tracking
- Job Management
- Repair Procedures
- Analytics & Earnings

**Key Integrations:**
- Socket.IO for real-time communication
- Google Cloud Storage / Azure Blob for file uploads
- PDF generation for receipts
- Distance calculation & geolocation

---
