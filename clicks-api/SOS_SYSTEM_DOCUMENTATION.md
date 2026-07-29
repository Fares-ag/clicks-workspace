# SOS System Documentation

## Overview
The SOS system enables customers to broadcast emergency requests to nearby technicians in real-time using WebSocket connections. The system uses a 60-second broadcast window where technicians can accept the request on a first-come-first-served basis.

## Architecture

### WebSocket Namespaces
- **Customer Namespace**: `/customer` - For customer connections
- **Technician Namespace**: `/technician` - For technician connections

### Key Features
- Real-time SOS broadcasting to nearby technicians (20km radius)
- 60-second timeout for SOS requests
- Automatic job creation upon acceptance
- Real-time distance and status updates
- First-come-first-served acceptance model

---

## Customer Flow

### 1. Connect to WebSocket
```javascript
const socket = io('http://your-server-url/customer');

// Register the customer
socket.emit('register', customerId);
```

### 2. Create SOS Request
```javascript
socket.emit('createSOS', {
  customer_id: 'customer_id_here',
  customer_vehicle_id: 'vehicle_id_here',
  latitude: 37.7749,
  longitude: -122.4194
});
```

### 3. Listen for Events

#### SOS Created Confirmation
```javascript
socket.on('sosCreated', (data) => {
  console.log('SOS created:', data);
  // data: { sos_id, status: 'pending', expires_at }
});
```

#### SOS Accepted by Technician
```javascript
socket.on('sosAccepted', (data) => {
  console.log('Technician accepted:', data);
  /* data: {
    sos_id,
    job_id,
    technician: { id, name, phone, profilePicture },
    distance, // in km
    status: 'assigned'
  } */
});
```

#### SOS Expired (No technician accepted within 60 seconds)
```javascript
socket.on('sosExpired', (data) => {
  console.log('SOS expired:', data);
  // data: { sos_id, message }
});
```

#### Job Status Updates from Technician
```javascript
socket.on('jobStatusUpdate', (data) => {
  console.log('Job status update:', data);
  /* data: {
    job_id,
    status, // 'en_route', 'arrived', 'in_progress', 'completed'
    distance, // current distance from technician to customer
    technician_location: { latitude, longitude }
  } */
});
```

### 4. Cancel SOS (Optional, before acceptance)
```javascript
socket.emit('cancelSOS', {
  sos_id: 'sos_id_here',
  reason: 'Customer cancelled'
});

socket.on('sosCancelled', (data) => {
  console.log('SOS cancelled:', data);
  // data: { sos_id, status: 'cancelled' }
});
```

---

## Technician Flow

### 1. Connect to WebSocket
```javascript
const socket = io('http://your-server-url/technician');

// Register the technician
socket.emit('register', technicianId);
```

### 2. Update Location Regularly
```javascript
// Update location every 5-10 seconds when online
setInterval(() => {
  socket.emit('updateLocation', {
    technician_id: 'technician_id_here',
    latitude: 37.7749,
    longitude: -122.4194
  });
}, 5000);
```

### 3. Listen for SOS Broadcasts
```javascript
socket.on('newSOSRequest', (data) => {
  console.log('New SOS request:', data);
  /* data: {
    sos_id,
    customer: { id, name, phone },
    vehicle: { make, model, year, color, licensePlate },
    location: { latitude, longitude },
    distance, // distance from technician in km
    expires_at // timestamp when SOS expires
  } */
});
```

### 4. Accept SOS Request
```javascript
socket.emit('acceptSOS', {
  sos_id: 'sos_id_here',
  technician_id: 'technician_id_here'
});

// Confirmation
socket.on('sosAcceptedConfirm', (data) => {
  console.log('SOS accepted successfully:', data);
  /* data: {
    sos_id,
    job_id,
    customer: { id, name, phone },
    vehicle: { make, model, year, color, licensePlate },
    location: { latitude, longitude }
  } */
});

// If already accepted by another technician
socket.on('sosAlreadyAccepted', (data) => {
  console.log('SOS already accepted:', data);
  // data: { sos_id, message }
});
```

### 5. Update Job Status
```javascript
// Update status as you progress
const statuses = [
  'assigned',     // Initial status after acceptance
  'en_route',     // Traveling to customer location
  'arrived',      // Arrived at location
  'in_progress',  // Started working on the vehicle
  'completed'     // Job finished
];

socket.emit('updateJobStatus', {
  job_id: 'job_id_here',
  status: 'en_route',
  customer_id: 'customer_id_here',
  distance: 5.2, // current distance in km
  latitude: 37.7749,
  longitude: -122.4194
});
```

---

## REST API Endpoints

### Get SOS History (Customer)
```
GET /api/sos
Authorization: Bearer <customer_token>
```
Response:
```json
{
  "requests": [
    {
      "_id": "sos_id",
      "customer_id": "...",
      "customer_vehicle_id": "...",
      "location": { "type": "Point", "coordinates": [-122.4194, 37.7749] },
      "status": "completed",
      "assigned_technician": "...",
      "job_id": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### Get Specific SOS Request
```
GET /api/sos/:id
Authorization: Bearer <token>
```

### Get Technician SOS History
```
GET /api/sos/technician/history
Authorization: Bearer <technician_token>
```

---

## Contact Us API

### Submit Contact Request
```
POST /api/contact-us
Authorization: Bearer <customer_token>
Content-Type: application/json

{
  "issue": "Payment Issue",
  "description": "I was charged twice for the same service"
}
```
Response:
```json
{
  "message": "Contact request submitted successfully",
  "contactUs": {
    "_id": "contact_id",
    "customer_id": "customer_id",
    "issue": "Payment Issue",
    "description": "I was charged twice for the same service",
    "status": "pending",
    "createdAt": "..."
  }
}
```

### Get Contact History
```
GET /api/contact-us
Authorization: Bearer <customer_token>
```

---

## Database Models

### SOSRequest Schema
```javascript
{
  customer_id: ObjectId (ref: Customer),
  customer_vehicle_id: ObjectId (ref: CustomerVehicle),
  location: {
    type: "Point",
    coordinates: [longitude, latitude]
  },
  status: "pending" | "accepted" | "cancelled" | "expired" | "completed",
  assigned_technician: ObjectId (ref: Technician),
  cancel_reason: String,
  broadcast_started_at: Date,
  broadcast_expires_at: Date,
  accepted_at: Date,
  job_id: ObjectId (ref: Job),
  createdAt: Date,
  updatedAt: Date
}
```

### Technician Schema Updates
```javascript
{
  // ... existing fields
  currentStatus: "Online" | "Offline" | "On Job",
  currentLocation: {
    type: "Point",
    coordinates: [longitude, latitude]
  }
}
```

### ContactUs Schema
```javascript
{
  customer_id: ObjectId (ref: Customer),
  issue: String,
  description: String,
  status: "pending" | "in_progress" | "resolved",
  createdAt: Date,
  updatedAt: Date
}
```

---

## Job Status Flow

1. **assigned** - Technician accepted SOS, job created
2. **en_route** - Technician traveling to customer location
3. **arrived** - Technician arrived at location
4. **in_progress** - Technician started working
5. **completed** - Job finished

When status changes to `completed`:
- Technician status changes from "On Job" back to "Online"
- SOS status changes to "completed"

---

## Important Notes

1. **Location Updates**: Technicians should update their location every 5-10 seconds when online to ensure accurate distance calculations and SOS broadcasts.

2. **20km Radius**: Only technicians within 20km of the SOS location will receive the broadcast.

3. **60-Second Window**: Customers have a 60-second window where technicians can accept. After this, the SOS expires automatically.

4. **First-Come-First-Served**: The first technician to accept the SOS gets the job. Other technicians will be notified that it's already been accepted.

5. **Technician Status**: When a technician accepts an SOS, their status automatically changes to "On Job" and they won't receive new SOS broadcasts until they complete the current job.

6. **Geospatial Indexing**: Both Technician and SOSRequest collections have 2dsphere indexes for efficient location-based queries.

---

## Error Handling

All WebSocket events can emit an 'error' event:
```javascript
socket.on('error', (data) => {
  console.error('Error:', data.message, data.details);
});
```

---

## Testing

### Test Customer Connection
```bash
# Install socket.io-client for testing
npm install socket.io-client

# Create test script (test-customer.js)
node test-customer.js
```

### Test Technician Connection
```bash
node test-technician.js
```

Example test files should be created to simulate the full flow.
