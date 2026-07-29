# Quick Start Guide - SOS System

## 🚀 Getting Started in 5 Minutes

### 1. Start the Server
```bash
cd clicks-customer-tech-api
npm install
npm run dev
```

You should see:
```
Clicks Customer/Technician API running on port 5001
Socket.io initialized with customer and technician namespaces
```

### 2. Verify Database Indexes

Open MongoDB shell or Compass and run:
```javascript
// Check technician indexes
db.technicians.getIndexes()
// Should include: { currentLocation: "2dsphere" }

// Check SOS indexes
db.sosrequests.getIndexes()
// Should include: { location: "2dsphere" }
```

If indexes don't exist, create them:
```javascript
db.technicians.createIndex({ currentLocation: "2dsphere" });
db.sosrequests.createIndex({ location: "2dsphere" });
```

### 3. Prepare Test Data

**Set a technician to Online status:**
```javascript
db.technicians.updateOne(
  { email: "technician@example.com" }, // or use _id
  {
    $set: {
      currentStatus: "Online",
      "currentLocation.coordinates": [-122.4194, 37.7749]
    }
  }
)
```

**Get IDs for testing:**
```javascript
// Get customer ID
const customer = db.customers.findOne();
console.log("Customer ID:", customer._id.toString());

// Get vehicle ID
const vehicle = db.customervehicles.findOne({ customer_id: customer._id });
console.log("Vehicle ID:", vehicle._id.toString());

// Get technician ID
const tech = db.technicians.findOne({ currentStatus: "Online" });
console.log("Technician ID:", tech._id.toString());
```

### 4. Test with Curl (Contact Us)

```bash
# Get your auth token first by logging in as a customer
curl -X POST http://localhost:5001/api/contact-us \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "issue": "Test Issue",
    "description": "This is a test contact request"
  }'
```

### 5. Test WebSocket (Using Test Scripts)

**Terminal 1 - Technician:**
```bash
cd test-scripts
npm install socket.io-client

# Edit test-technician-sos.js and add your technician ID
# Then run:
node test-technician-sos.js
```

**Terminal 2 - Customer:**
```bash
cd test-scripts

# Edit test-customer-sos.js and add your customer & vehicle IDs
# Then run:
node test-customer-sos.js
```

You should see the complete SOS flow in action!

---

## 🔍 What to Look For

### Server Logs
```
Technician 507f1f77bcf86cd799439011 registered with socket abc123
Customer 507f1f77bcf86cd799439012 registered with socket def456
Broadcasting SOS 507f1f77bcf86cd799439013 to 3 nearby technicians
SOS accepted by technician 507f1f77bcf86cd799439011
```

### Customer Output
```
✅ Connected to customer namespace
🚨 Creating SOS request...
✅ SOS Created: { sos_id: '...', status: 'pending', expires_at: '...' }
🎉 SOS ACCEPTED by technician!
   Technician: John Doe
   Distance: 2.5 km
📍 Job Status Update: en_route
📍 Job Status Update: arrived
📍 Job Status Update: completed
```

### Technician Output
```
✅ Connected to technician namespace
👀 Listening for SOS requests...
🚨 NEW SOS REQUEST!
   Customer: Jane Smith
   Distance: 2.5 km
✅ Accepting SOS...
🎉 SOS ACCEPTED SUCCESSFULLY!
   Job ID: ...
```

---

## 🐛 Troubleshooting

### "No SOS requests received"
- ✅ Check technician `currentStatus` is "Online"
- ✅ Check technician location is within 20km of customer
- ✅ Check technician is connected and registered
- ✅ Check geospatial indexes exist

### "Connection refused"
- ✅ Check server is running on port 5001
- ✅ Check firewall settings
- ✅ Verify MongoDB is running

### "Error creating SOS"
- ✅ Check customer_id exists in database
- ✅ Check customer_vehicle_id exists in database
- ✅ Check lat/lng are valid numbers

### "SOS expires immediately"
- ✅ Check server time is correct
- ✅ Check broadcast_expires_at field
- ✅ Verify no errors in server logs

---

## 📊 Database Verification

After testing, check the database:

```javascript
// View created SOS
db.sosrequests.find().sort({ createdAt: -1 }).limit(1).pretty()

// View created job
db.jobs.find().sort({ createdAt: -1 }).limit(1).pretty()

// Check technician status changed
db.technicians.findOne(
  { _id: ObjectId("technician_id") },
  { currentStatus: 1 }
)
// Should be "Online" after job completion

// View contact us submissions
db.contactuses.find().pretty()
```

---

## 🎯 Next Steps

1. **Mobile App Integration**
   - Implement Socket.IO client in React Native/Flutter
   - Add UI for SOS creation and status tracking
   - Add real-time location tracking for technicians

2. **Production Readiness**
   - Set up proper authentication for WebSocket connections
   - Add rate limiting for SOS creation
   - Implement connection recovery and reconnection logic
   - Add comprehensive error handling
   - Set up monitoring and alerting

3. **Enhancements**
   - Add push notifications for SOS acceptance
   - Add SMS notifications as fallback
   - Implement SOS priority levels
   - Add technician ratings after job completion
   - Create admin dashboard to monitor active SOS requests

---

## 📚 Documentation

- **Full API Docs**: `SOS_SYSTEM_DOCUMENTATION.md`
- **Migration Guide**: `SOS_MIGRATION_GUIDE.md`
- **Testing Guide**: `test-scripts/README.md`
- **Implementation Details**: `IMPLEMENTATION_SUMMARY.md`

---

**Ready to go live? Make sure you've tested all flows and verified the database changes!** 🚀
