# SOS System Refactoring - Complete Implementation

## Overview
The SOS system has been refactored so that when a customer sends an SOS request, it goes to the **admin** instead of nearby technicians. The admin then manually creates a job and assigns a specific technician, who then receives the SOS notification.

---

## Flow Changes

### **OLD FLOW:**
1. Customer sends SOS → 
2. Broadcast to nearby technicians (20km radius) → 
3. First technician accepts → 
4. Job auto-created → 
5. Technician proceeds

### **NEW FLOW:**
1. Customer sends SOS → 
2. **Admin receives notification popup** → 
3. **Admin creates job manually** (using Job Management) → 
4. **Admin assigns specific technician** → 
5. **Assigned technician receives SOS notification** → 
6. Technician accepts →
7. Technician proceeds with job

---

## Backend Changes

### 1. **Socket Service** (`clicks-customer-tech-api/src/services/sosSocketService.js`)

**Added:**
- Admin namespace `/admin` for admin socket connections
- `adminSockets` Map to track connected admins
- Admin connection handlers (register, disconnect)

**Modified:**
- `createSOS` handler now broadcasts to admins instead of technicians
- Removed auto-broadcast to nearby technicians
- SOS data includes customer info, vehicle details, and location

**Replaced:**
- `acceptSOS` handler → `acceptSOSJob` handler
- Technicians now accept jobs created by admin (not direct SOS)
- No automatic job creation on acceptance

**Exported:**
- `notifyAssignedTechnician()` function to notify technician after admin creates job

### 2. **Job Controller** (`clicks-customer-tech-api/src/controllers/jobController.js`)

**Updated `createJob` function:**
- Accepts `sos_id` parameter
- When `sos_id` is provided:
  - Updates SOS status to "accepted"
  - Links job to SOS
  - Updates technician status to "On Job"
  - Calls `notifyAssignedTechnician()` to send socket notification

### 3. **Socket Initialization** (`clicks-customer-tech-api/src/index.js`)

- Stores `notifyAssignedTechnician` function in app settings
- Makes it accessible to job controller via `req.app.get('notifyAssignedTechnician')`

---

## Frontend Changes

### 1. **SOS Notification Component** (`clicks-interface/src/components/SOSNotification.jsx`)

**New component** that displays SOS popup to admin with:
- Emergency header with timer
- Customer information (name, phone)
- Vehicle details (make, model, year, color, license plate)
- Location coordinates
- Actions: Dismiss or Create Job

**Features:**
- 60-second countdown timer
- Auto-dismisses when timer expires
- Plays notification sound on popup

### 2. **Admin Layout** (`clicks-interface/src/components/AdminLayout.jsx`)

**Added:**
- Socket.IO connection to `/admin` namespace
- Listens for `newSOSRequest` events
- Displays SOSNotification component when SOS received
- Navigates to Jobs page when admin clicks "Create Job"

### 3. **Jobs Page** (`clicks-interface/src/pages/JobManagement/Jobs.jsx`)

**Added:**
- Checks for `sosData` in navigation state
- Auto-opens AddJobModal when navigated from SOS notification
- Passes `sosData` to AddJobModal

### 4. **Add Job Modal** (`clicks-interface/src/components/AddJobModal.jsx`)

**Enhanced:**
- Accepts `sosData` prop
- Auto-populates form with SOS customer/vehicle data
- Fetches and displays all online technicians
- Shows green indicator (🟢) for online technicians
- Includes `sos_id` in job creation payload
- Makes technician selection required for SOS jobs

---

## Socket Events

### **Admin Namespace** (`/admin`)
- **Emit:** `register` - Admin registers with their ID
- **Listen:** `newSOSRequest` - Receives SOS notifications

### **Customer Namespace** (`/customer`)
- **Emit:** `createSOS` - Customer creates SOS request
- **Listen:** `sosCreated` - Confirmation that SOS was created
- **Listen:** `sosAccepted` - Technician accepted the job
- **Listen:** `sosExpired` - No response within 60 seconds

### **Technician Namespace** (`/technician`)
- **Listen:** `newSOSRequest` - Receives assigned SOS job from admin
- **Emit:** `acceptSOSJob` - Accepts the assigned SOS job
- **Listen:** `sosJobAccepted` - Confirmation of acceptance

---

## Data Flow

### **SOS Creation:**
```javascript
Customer → createSOS → Backend creates SOS → Broadcast to Admin
```

### **Admin Handles SOS:**
```javascript
Admin receives popup → Admin creates job via UI → Backend:
  1. Creates job with sos_id
  2. Updates SOS status to "accepted"
  3. Links job to SOS
  4. Updates technician status
  5. Calls notifyAssignedTechnician()
```

### **Technician Notification:**
```javascript
Backend notifyAssignedTechnician() → Socket emits to assigned technician →
Technician receives newSOSRequest → Technician accepts via acceptSOSJob
```

---

## API Changes

### **Job Creation Endpoint:**
`POST /api/jobs`

**Request Body (Enhanced):**
```json
{
  "clientName": "string",
  "clientMobileNumber": "string",
  "issue": "string",
  "location": "string",
  "dateTime": "ISO date",
  "assignedTechnician": "technician_id",
  "price": number,
  "source": "string",
  "sos_id": "sos_request_id" // NEW: Optional, for SOS jobs
}
```

---

## Key Features

✅ Admin receives SOS notifications in real-time
✅ Admin has full control over technician assignment
✅ Shows all technicians (not just nearby ones)
✅ Displays online status of technicians
✅ SOS data auto-populates job form
✅ Customer notified when technician accepts
✅ 60-second timeout still enforced
✅ Maintains all existing job flow after acceptance

---

## Testing Checklist

- [ ] Customer can create SOS request
- [ ] Admin receives SOS popup
- [ ] SOS popup displays correct customer/vehicle info
- [ ] Timer counts down from 60 seconds
- [ ] Admin can dismiss notification
- [ ] Admin can click "Create Job"
- [ ] Job form auto-populates with SOS data
- [ ] Technician dropdown shows all technicians
- [ ] Online technicians show green indicator
- [ ] Job creation links to SOS
- [ ] Assigned technician receives notification
- [ ] Technician can accept job
- [ ] Customer receives acceptance notification
- [ ] Rest of job flow works normally

---

## Files Modified

**Backend:**
1. `clicks-customer-tech-api/src/services/sosSocketService.js`
2. `clicks-customer-tech-api/src/controllers/jobController.js`
3. `clicks-customer-tech-api/src/index.js` (already had setup)

**Frontend:**
4. `clicks-interface/src/components/SOSNotification.jsx` (NEW)
5. `clicks-interface/src/components/SOSNotification.css` (NEW)
6. `clicks-interface/src/components/AdminLayout.jsx`
7. `clicks-interface/src/pages/JobManagement/Jobs.jsx`
8. `clicks-interface/src/components/AddJobModal.jsx`

---

## Environment Variables Needed

**Frontend:**
```env
VITE_API_URL=http://localhost:5001  # Customer/Technician API URL
```

---

## Next Steps

1. Add notification sound file to `/public/notification.mp3`
2. Test end-to-end SOS flow
3. Add admin dashboard to show pending SOS queue (optional)
4. Add SOS history/logs in admin panel (optional)
5. Handle multiple admins scenario (currently all admins get notification)
