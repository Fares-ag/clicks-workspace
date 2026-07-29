# Clicks Roadside Assistance - Complete Booking Flow Documentation

## Overview

This document describes the complete flow from when a customer initiates an SOS request to when the technician marks the job as completed and payment is received.

---

## 🔌 WebSocket Connection URLs

### Customer-Tech API WebSocket Namespaces (Port 5001)

| Namespace      | URL                              | Purpose                     |
| -------------- | -------------------------------- | --------------------------- |
| **Customer**   | `ws://localhost:5001/customer`   | Customer app connections    |
| **Technician** | `ws://localhost:5001/technician` | Technician app connections  |
| **Admin**      | `ws://localhost:5001/admin`      | Admin dashboard connections |

---

## 📊 SOS Request Status Flow

```
      ┌─────────────┐
      │   PENDING   │ (Customer sends SOS)
      └──────┬──────┘
             │
             ▼
      ┌─────────────┐
      │   IN_CALL   │ (Admin clicks Create Job, calling customer) ⚡
      └──────┬──────┘
             │
             ▼
      ┌─────────────┐
      │  ACCEPTED   │ (Admin creates job with technician)
      └─────────────┘
```

## 📊 Job Status Flow

```
                    ┌─────────────┐
                    │   PENDING   │ (Job created, no technician yet)
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  ASSIGNED   │ (Admin assigns technician)
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
      ┌───────────────┐        ┌───────────────┐
      │   ACCEPTED    │        │   CANCELLED   │ (Technician rejected)
      │ (Tech accepts)│        └───────────────┘
      └───────┬───────┘
              │
              ▼
      ┌───────────────┐
      │   EN_ROUTE    │ (Technician traveling) - WebSocket
      └───────┬───────┘
              │
              ▼
      ┌───────────────┐
      │    ARRIVED    │ (WebSocket broadcast to customer) ⚡
      └───────┬───────┘
              │
              ▼
      ┌───────────────┐
      │  IN_PROGRESS  │ (WebSocket broadcast to customer) ⚡
      └───────┬───────┘
              │
              ▼
      ┌───────────────┐
      │   COMPLETED   │ (Work finished, repairs added)
      └───────┬───────┘
              │
              ▼
      ┌───────────────┐
      │     PAID      │ (WebSocket broadcast to customer) ⚡ NEW
      └───────────────┘
```

> **Note:** `IN_CALL` is an **SOS Request status**, not a Job status. The customer app shows an "In Call" screen when they receive the `sosInCall` event.

---

## 📱 Complete Booking Flow

### Phase 1: SOS Request (Customer → Admin)

#### Step 1.1: Customer Initiates SOS

**WebSocket Connection:**

```javascript
// Customer connects to socket
const socket = io("http://localhost:5001/customer");

// Register customer
socket.emit("register", customer_id);
```

**Create SOS Request:**

```javascript
// Customer triggers SOS
socket.emit("createSOS", {
  customer_id: "customer_object_id",
  customer_vehicle_id: "vehicle_object_id",
  latitude: 25.2048,
  longitude: 55.2708,
});
```

**Customer Receives Confirmation:**

```javascript
socket.on("sosCreated", (data) => {
  // data = { sos_id, status: "pending", expires_at }
  // Start 60-second countdown timer
});
```

#### Step 1.2: Admin Receives SOS Notification

**Admin WebSocket Connection:**

```javascript
// Admin connects to socket
const socket = io("http://localhost:5001/admin");

// Register admin
socket.emit("register", admin_id);
```

**Admin Receives SOS Popup:**

```javascript
socket.on("newSOSRequest", (sosData) => {
  // sosData contains:
  {
    sos_id: "sos_object_id",
    customer_id: "customer_object_id",
    customer_vehicle_id: "vehicle_object_id",
    customer: {
      id: "customer_id",
      name: "John Doe",
      phone: "+971501234567"
    },
    vehicle: {
      id: "vehicle_id",
      make: "Toyota",
      model: "Camry",
      year: 2023,
      color: "White",
      plate: "ABC 1234"
    },
    location: {
      latitude: 25.2048,
      longitude: 55.2708,
      coordinates: "25.2048, 55.2708"
    },
    expires_at: "2025-11-25T10:01:00.000Z"
  }
});
```

---

### Phase 2: Job Creation (Admin → Technician)

#### Step 2.1: Admin Creates Job with Status "assigned"

**Admin API Endpoint:**

```http
POST http://localhost:5000/api/jobs
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "customer_id": "customer_object_id",
  "customer_vehicle_id": "vehicle_object_id",
  "clientName": "John Doe",
  "clientMobileNumber": "+971501234567",
  "issue": "Flat tire - needs roadside assistance",
  "location": "25.2048, 55.2708",
  "dateTime": "2025-11-25T10:00:00.000Z",
  "assignedTechnician": "technician_object_id",
  "price": 150,
  "source": "source_object_id",
  "job_status": "assigned",
  "sos_request_id": "sos_object_id"
}
```

> ⚠️ **Note:** When admin assigns a technician, status should be `"assigned"` NOT `"pending"`

**What Happens Behind the Scenes:**

1. Job is created in database with status `"assigned"`
2. SOS request status is updated to "accepted"
3. Socket notification sent to assigned technician
4. Customer receives `technicianAssigned` event

#### Step 2.2: Technician Receives Job Notification

**Technician WebSocket:**

```javascript
socket.on("newJobAssigned", (jobData) => {
  // jobData contains:
  {
    job_id: "job_object_id",
    sos_id: "sos_object_id",
    customer: {
      name: "John Doe",
      phone: "+971501234567"
    },
    vehicle: {
      make: "Toyota",
      model: "Camry",
      year: 2023,
      color: "White",
      plate: "ABC 1234"
    },
    location: {
      latitude: 25.2048,
      longitude: 55.2708
    },
    price: 150
  }
});
```

---

### Phase 3: Technician Accepts/Rejects Job

#### Option A: Technician Accepts Job (assigned → accepted)

**REST API Endpoint:**

```http
POST http://localhost:5001/api/technicians/jobs/:job_id/accept
Authorization: Bearer <technician_jwt_token>
```

**Response (200 OK):**

```json
{
  "message": "Job accepted",
  "job_status": "accepted",
  "accepted_at": "2025-11-27T10:05:00.000Z"
}
```

**What Happens:**

1. Job status changes from `"assigned"` → `"accepted"`
2. `accepted_at` timestamp is set
3. Technician status changes to `"On Job"`
4. Customer is notified via WebSocket

**Customer Receives:**

```javascript
socket.on("technicianAccepted", (data) => {
  // data = {
  //   job_id,
  //   status: "accepted",
  //   technician: { id, name, phone, photo },
  //   accepted_at
  // }
});
```

#### Option B: Technician Rejects Job

**REST API Endpoint:**

```http
POST http://localhost:5001/api/technicians/jobs/:job_id/reject
Authorization: Bearer <technician_jwt_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "rejection_reasons": ["Too far away", "Currently busy"],
  "rejection_description": "Unable to reach location within required time"
}
```

**Response (200 OK):**

```json
{
  "message": "Job rejected",
  "job_status": "cancelled"
}
```

---

### Phase 4: Technician En Route

#### Step 4.1: Start En Route (WebSocket)

**Technician Emits:**

```javascript
socket.emit("startEnRoute", { job_id: "job_id" });
```

**Technician Receives Confirmation:**

```javascript
socket.on("enRouteConfirmed", (data) => {
  // data = { job_id, status: "en_route", en_route_at }
});
```

**Customer Receives:**

```javascript
socket.on("technicianEnRoute", (data) => {
  // data = { job_id, status: "en_route", en_route_at }
  // Start showing technician on map
});
```

#### Step 4.2: Location Updates (Continuous)

**Technician Emits (every 30 seconds):**

```javascript
socket.emit("updateLocation", {
  technician_id: "tech_id",
  latitude: 25.195,
  longitude: 55.265,
  job_id: "job_id",
});
```

**Customer Receives:**

```javascript
socket.on("locationUpdate", (data) => {
  // data = { job_id, latitude, longitude, timestamp }
  // Update technician marker on map
});
```

---

### Phase 5: Technician Arrives ⚡ (WebSocket)

**Technician Emits:**

```javascript
socket.emit("markArrived", { job_id: "job_id" });
```

**Technician Receives Confirmation:**

```javascript
socket.on("arrivedConfirmed", (data) => {
  // data = { job_id, status: "arrived", arrived_at, message }
});
```

**Customer Receives:**

```javascript
socket.on("technicianArrived", (data) => {
  // data = { job_id, status: "arrived", arrived_at }
  // Show "Technician has arrived!" notification
});
```

---

### Phase 6: Start Job ⚡ (WebSocket)

**Technician Emits:**

```javascript
socket.emit("startJob", { job_id: "job_id" });
```

**Technician Receives Confirmation:**

```javascript
socket.on("jobStartedConfirmed", (data) => {
  // data = { job_id, status: "in_progress", started_at, message }
});
```

**Customer Receives:**

```javascript
socket.on("jobStarted", (data) => {
  // data = { job_id, status: "in_progress", started_at }
  // Show "Technician is working on your vehicle" UI
});
```

---

### Phase 7: Add Repairs & Complete Job

#### Step 7.1: Add Repair Procedures (REST API)

**Technician adds repairs:**

```http
POST http://localhost:5001/api/jobs/:job_id/repairs
Authorization: Bearer <technician_jwt_token>
Content-Type: application/json

{
  "description": "Tire replacement - Continental 205/55R16",
  "quantity": 1,
  "price": 250
}
```

#### Step 7.2: Complete Job (REST API)

**Technician marks job as completed:**

```http
POST http://localhost:5001/api/jobs/:job_id/complete
Authorization: Bearer <technician_jwt_token>
```

**Response:**

```json
{
  "message": "Job marked as completed",
  "job_status": "completed"
}
```

---

### Phase 8: Payment Received ⚡ (WebSocket)

**Technician Emits:**

```javascript
socket.emit("paymentReceived", {
  job_id: "job_id",
  payment_method: "cash", // or "card"
  notes: "Customer paid in cash",
});
```

**Technician Receives Confirmation:**

```javascript
socket.on("paymentConfirmed", (data) => {
  // data = {
  //   job_id,
  //   status: "paid",
  //   receipt: {...},
  //   message
  // }
  // Navigate to completed jobs
});
```

**Customer Receives:**

```javascript
socket.on("jobCompleted", (data) => {
  // data = {
  //   job_id,
  //   status: "paid",
  //   total_amount: 480,
  //   receipt: {...},
  //   technician: { name, photo }
  // }
  // Show "Job Complete!" screen with receipt
  // Show rating prompt
});
```

---

### Phase 9: Customer Rating (Optional - REST API)

```http
POST http://localhost:5001/api/jobs/:job_id/rate
Authorization: Bearer <customer_jwt_token>
Content-Type: application/json

{
  "rating": 5,
  "rating_description": "Excellent service!"
}
```

---

## 📋 Summary of Changes

| Action                   | Before                   | After                                            |
| ------------------------ | ------------------------ | ------------------------------------------------ |
| Admin assigns technician | Status: `pending`        | Status: `assigned`                               |
| Technician accepts       | Status: `assigned` (old) | Status: `accepted`                               |
| Mark Arrived             | REST API                 | **WebSocket** (broadcasts to customer)           |
| Start Job                | REST API                 | **WebSocket** (broadcasts to customer)           |
| Payment Received         | REST API                 | **WebSocket** (broadcasts to customer, ends job) |

---

## 🌐 Updated WebSocket Events

### Technician Namespace (`/technician`)

| Event                 | Direction           | Description                   |
| --------------------- | ------------------- | ----------------------------- |
| `register`            | Client → Server     | Register technician ID        |
| `updateLocation`      | Client → Server     | Update GPS location           |
| `startEnRoute`        | Client → Server     | Start traveling to customer   |
| `markArrived`         | **Client → Server** | **Mark as arrived** ⚡        |
| `startJob`            | **Client → Server** | **Start the job** ⚡          |
| `paymentReceived`     | **Client → Server** | **Confirm payment** ⚡        |
| `newJobAssigned`      | Server → Client     | New job assignment            |
| `enRouteConfirmed`    | Server → Client     | En route confirmation         |
| `arrivedConfirmed`    | Server → Client     | Arrival confirmation          |
| `jobStartedConfirmed` | Server → Client     | Job start confirmation        |
| `paymentConfirmed`    | Server → Client     | Payment confirmation          |
| `jobCancelled`        | **Server → Client** | **Job cancelled by admin** ⚡ |
| `error`               | Server → Client     | Error messages                |

### Customer Namespace (`/customer`)

| Event                | Direction           | Description                                            |
| -------------------- | ------------------- | ------------------------------------------------------ |
| `register`           | Client → Server     | Register customer ID                                   |
| `createSOS`          | Client → Server     | Create SOS request                                     |
| `cancelSOS`          | Client → Server     | Cancel SOS                                             |
| `sosCreated`         | Server → Client     | SOS confirmed                                          |
| `sosExpired`         | Server → Client     | SOS expired                                            |
| `sosCancelled`       | Server → Client     | SOS cancelled                                          |
| `sosInCall`          | **Server → Client** | **Admin is calling customer (show In Call screen)** ⚡ |
| `technicianAssigned` | Server → Client     | Technician assigned by admin                           |
| `technicianAccepted` | Server → Client     | Technician accepted job                                |
| `technicianEnRoute`  | Server → Client     | Technician started traveling (show map screen)         |
| `locationUpdate`     | Server → Client     | Technician location update                             |
| `technicianArrived`  | **Server → Client** | **Technician arrived** ⚡                              |
| `jobStarted`         | **Server → Client** | **Job work started** ⚡                                |
| `jobCompleted`       | **Server → Client** | **Job finished & paid** ⚡                             |
| `jobCancelled`       | **Server → Client** | **Job cancelled by admin** ⚡                          |
| `error`              | Server → Client     | Error messages                                         |

### Admin Namespace (`/admin`)

| Event            | Direction           | Description                                         |
| ---------------- | ------------------- | --------------------------------------------------- |
| `register`       | Client → Server     | Register admin ID                                   |
| `sosAccepted`    | Client → Server     | Admin clicks Create Job (triggers sosInCall)        |
| `adminCancelJob` | **Client → Server** | **Admin cancels job (notifies customer & tech)** ⚡ |
| `newSOSRequest`  | Server → Client     | New SOS request popup                               |
| `jobCancelled`   | Server → Client     | Confirmation that job was cancelled                 |

---

## 🔄 Visual Flow Diagram

```
┌──────────────┐     createSOS      ┌──────────────┐    newSOSRequest    ┌──────────────┐
│   CUSTOMER   │ ──────────────────▶│    SERVER    │ ──────────────────▶ │    ADMIN     │
│    (App)     │                    │  (Port 5001) │                     │ (Dashboard)  │
└──────────────┘                    └──────────────┘                     └──────┬───────┘
       ▲                                   │                                    │
       │                                   │                         emit("sosAccepted")
       │         sosInCall ⚡              │                          (Admin clicks
       │ ◀─────────────────────────────────┤◀───────────────────────── Create Job)
       │         (Show "In Call" screen)   │                                    │
       │                                   │                                    │
       │                                   │                          POST /api/jobs
       │                                   │                          (status: assigned)
       │                                   ▼                                    │
       │                            ┌──────────────┐    newJobAssigned          │
       │                            │  TECHNICIAN  │ ◀──────────────────────────┘
       │                            │    (App)     │
       │                            └──────┬───────┘
       │                                   │
       │         technicianAccepted        │  POST /accept (assigned → accepted)
       │ ◀─────────────────────────────────┤
       │                                   │
       │         technicianEnRoute         │  emit("startEnRoute")
       │ ◀─────────────────────────────────┤
       │         (Show Map screen)         │
       │                                   │
       │         locationUpdate            │  emit("updateLocation") [continuous]
       │ ◀─────────────────────────────────┤
       │                                   │
       │         technicianArrived         │  emit("markArrived") ⚡ WebSocket
       │ ◀─────────────────────────────────┤
       │                                   │
       │         jobStarted                │  emit("startJob") ⚡ WebSocket
       │ ◀─────────────────────────────────┤
       │                                   │
       │                                   │  POST /repairs (add items)
       │                                   │  POST /complete
       │                                   │
       │         jobCompleted              │  emit("paymentReceived") ⚡ WebSocket
       │ ◀─────────────────────────────────┤
       │                                   │
       │  POST /rate                       │
       │ ─────────────────────────────────▶│
       │                                   │
       ▼                                   ▼
   [SHOW RATING]                     [JOB COMPLETE]
```

---

## 🧪 Testing

Use the test files in `test-files/` directory:

1. **customer-sos-test.html** - Simulates customer app with all WebSocket events
2. **technician-app-test.html** - Simulates technician app with workflow buttons

### Testing Steps:

1. Start the Customer-Tech API: `cd clicks-customer-tech-api && npm start`
2. Open `customer-sos-test.html` in a browser
3. Open `technician-app-test.html` in another browser window
4. Enter valid Customer ID, Vehicle ID, and Technician ID from database
5. Connect both to the server
6. Send SOS from customer
7. Create job from Admin dashboard (or use Postman)
8. Accept job as technician
9. Go through the flow: En Route → Arrived → Start Job → Payment Received
10. Watch customer UI update in real-time!

---

## 🔄 App Resume / Session Recovery

When a customer or technician closes and reopens the app mid-job, the app needs to:

1. **Check for active session** via REST API
2. **Navigate to the correct screen** based on the status in the response
3. **Reconnect to WebSocket** to receive future updates

### Customer App Resume Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     CUSTOMER APP OPENS                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: REST API Call                                          │
│  GET /api/jobs/customer/session                                 │
│  Authorization: Bearer <customer_jwt_token>                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Check response and navigate based on status            │
│                                                                 │
│  if (active_sos != null) {                                      │
│    // Navigate based on active_sos.status                       │
│  } else if (active_job != null) {                               │
│    // Navigate based on active_job.job_status                   │
│  } else {                                                       │
│    navigate("home");                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Connect to WebSocket & Register                        │
│  socket.emit("register", customer_id)                           │
│                                                                 │
│  Now receiving live updates for the active job                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Customer Session Endpoint

```http
GET http://localhost:5001/api/jobs/customer/session
Authorization: Bearer <customer_jwt_token>
```

**Response (Active Job):**

```json
{
  "active_sos": null,
  "active_job": {
    "_id": "job_id",
    "job_status": "en_route",
    "assignedTechnician": {
      "_id": "tech_id",
      "firstName": "Ahmed",
      "lastName": "Khan",
      "phone": "+971501234567",
      "profilePicture": "url",
      "currentLocation": { "latitude": 25.2, "longitude": 55.3 }
    },
    "location": "25.2048, 55.2708",
    "issue": "Flat tire",
    "price": 150
  },
  "has_active_session": true
}
```

**Response (Active SOS):**

```json
{
  "active_sos": {
    "_id": "sos_id",
    "status": "pending",
    "expires_at": "2025-12-02T10:01:00.000Z"
  },
  "active_job": null,
  "has_active_session": true
}
```

**Response (No Active Session):**

```json
{
  "active_sos": null,
  "active_job": null,
  "has_active_session": false
}
```

#### Frontend Screen Navigation Logic

The frontend decides which screen to show based on the status:

**If `active_sos` exists:**
| `active_sos.status` | Navigate To |
| ------------------- | ------------------- |
| `pending` | SOS Waiting Screen |
| `in_call` | SOS In Call Screen |

**If `active_job` exists:**
| `active_job.job_status` | Navigate To |
| ----------------------- | -------------------- |
| `assigned` | Job Assigned Screen |
| `accepted` | Job Accepted Screen |
| `en_route` | Job Tracking Screen |
| `arrived` | Job Arrived Screen |
| `in_progress` | Job In Progress Screen |

---

### Technician App Resume Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TECHNICIAN APP OPENS                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: REST API Call                                          │
│  GET /api/jobs/technician/session                               │
│  Authorization: Bearer <technician_jwt_token>                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Check response and navigate based on job_status        │
│                                                                 │
│  if (active_job != null) {                                      │
│    // Navigate based on active_job.job_status                   │
│  } else {                                                       │
│    navigate("home");                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Connect to WebSocket & Register                        │
│  socket.emit("register", technician_id)                         │
│                                                                 │
│  Now receiving updates (e.g., jobCancelled)                     │
└─────────────────────────────────────────────────────────────────┘
```

#### Technician Session Endpoint

```http
GET http://localhost:5001/api/jobs/technician/session
Authorization: Bearer <technician_jwt_token>
```

**Response (Active Job):**

```json
{
  "technician": {
    "id": "tech_id",
    "name": "Ahmed Khan",
    "status": "On Job",
    "is_active": true
  },
  "active_job": {
    "_id": "job_id",
    "job_status": "en_route",
    "customer_id": {
      "_id": "customer_id",
      "first_name": "John",
      "last_name": "Doe",
      "phone_number": "+971501234567"
    },
    "customer_vehicle_id": {
      "vehicle_make": { "makeName": "Toyota" },
      "vehicle_model": { "modelName": "Camry" },
      "year": 2023,
      "vehicle_color": "White",
      "plate_number": "ABC 1234"
    },
    "location": "25.2048, 55.2708",
    "issue": "Flat tire",
    "price": 150
  },
  "has_active_job": true
}
```

**Response (No Active Job):**

```json
{
  "technician": {
    "id": "tech_id",
    "name": "Ahmed Khan",
    "status": "Available",
    "is_active": true
  },
  "active_job": null,
  "has_active_job": false
}
```

#### Frontend Screen Navigation Logic

The frontend decides which screen to show based on `active_job.job_status`:

| `active_job.job_status` | Navigate To         |
| ----------------------- | ------------------- |
| `assigned`              | New Job Screen      |
| `accepted`              | Job Accepted Screen |
| `en_route`              | Navigation Screen   |
| `arrived`               | Job Arrived Screen  |
| `in_progress`           | Job Working Screen  |

---

### Flutter Implementation Example

```dart
// On app launch or resume
Future<void> checkAndResumeSession() async {
  try {
    // Step 1: Check session via REST
    final response = await api.get('/jobs/customer/session');
    final session = SessionResponse.fromJson(response.data);

    // Step 2: Navigate based on status (frontend decides)
    if (session.activeSos != null) {
      switch (session.activeSos.status) {
        case 'pending':
          Get.offAll(() => SOSWaitingScreen(sos: session.activeSos));
          break;
        case 'in_call':
          Get.offAll(() => SOSInCallScreen(sos: session.activeSos));
          break;
      }
    } else if (session.activeJob != null) {
      switch (session.activeJob.jobStatus) {
        case 'en_route':
          Get.offAll(() => JobTrackingScreen(job: session.activeJob));
          break;
        case 'arrived':
          Get.offAll(() => JobArrivedScreen(job: session.activeJob));
          break;
        case 'in_progress':
          Get.offAll(() => JobInProgressScreen(job: session.activeJob));
          break;
        // ... handle other statuses
        default:
          Get.offAll(() => JobDetailsScreen(job: session.activeJob));
      }
    } else {
      Get.offAll(() => HomeScreen());
    }

    // Step 3: Connect to WebSocket
    socketService.connect();
    socketService.register(userId);

  } catch (e) {
    // If session check fails, go to home
    Get.offAll(() => HomeScreen());
  }
}
```

---

## 🔑 REST API Endpoints Summary

### Customer-Tech API (Port 5001)

| Method | Endpoint                           | Auth       | Description                      |
| ------ | ---------------------------------- | ---------- | -------------------------------- |
| GET    | `/api/jobs/customer/session`       | Customer   | Get session state for app resume |
| GET    | `/api/jobs/customer/active`        | Customer   | Get active job only              |
| GET    | `/api/jobs/customer/active-sos`    | Customer   | Get active SOS only              |
| GET    | `/api/jobs/technician/session`     | Technician | Get session state for app resume |
| GET    | `/api/jobs/technician/active`      | Technician | Get active job only              |
| POST   | `/api/technicians/jobs/:id/accept` | Technician | Accept job (assigned → accepted) |
| POST   | `/api/technicians/jobs/:id/reject` | Technician | Reject job                       |
| POST   | `/api/jobs/:id/repairs`            | Technician | Add repair procedure             |
| POST   | `/api/jobs/:id/complete`           | Technician | Mark job completed               |
| POST   | `/api/jobs/:id/rate`               | Customer   | Rate the job                     |

### Admin API (Port 5000)

| Method | Endpoint        | Auth  | Description                   |
| ------ | --------------- | ----- | ----------------------------- |
| POST   | `/api/jobs`     | Admin | Create job (status: assigned) |
| GET    | `/api/jobs`     | Admin | Get all jobs                  |
| PUT    | `/api/jobs/:id` | Admin | Update job                    |

---

This documentation covers the complete updated booking flow with WebSocket events for real-time customer notifications.
