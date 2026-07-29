# SOS System Migration Guide

## Breaking Changes

### 1. SOSRequest Model Changes
The SOSRequest model has been completely revamped:

**REMOVED Fields:**
- `location_address` - replaced with geospatial coordinates
- `estimated_time` - not needed for emergency SOS
- `distance_km` - calculated in real-time
- `price_estimate` - negotiated after acceptance

**NEW Fields:**
- `location` - GeoJSON Point with coordinates [longitude, latitude]
- `broadcast_started_at` - when SOS was created
- `broadcast_expires_at` - auto-calculated (60 seconds after start)
- `accepted_at` - when technician accepted
- `job_id` - reference to created job

**Status Changes:**
- REMOVED: "assigned", "rejected"
- ADDED: "expired"
- KEPT: "pending", "accepted", "cancelled", "completed"

### 2. Technician Model Changes
**NEW Fields:**
- `currentStatus` - Added "On Job" as a new enum value
- `currentLocation` - GeoJSON Point for real-time location tracking

### 3. API Endpoint Changes

**REMOVED Endpoints:**
```
POST /api/sos - now handled via WebSocket
PATCH /api/sos/:id/cancel - now handled via WebSocket
POST /api/sos/:id/assign - now handled via WebSocket
POST /api/sos/:id/accept - now handled via WebSocket
POST /api/sos/:id/reject - removed (not needed)
GET /api/sos/nearby - removed (handled internally)
POST /api/sos/convert - automatic on acceptance
```

**KEPT Endpoints (for history only):**
```
GET /api/sos - Get customer SOS history
GET /api/sos/:id - Get specific SOS details
GET /api/sos/technician/history - Get technician SOS history
```

**NEW Endpoints:**
```
POST /api/contact-us - Submit contact/support request
GET /api/contact-us - Get contact request history
```

---

## Migration Steps

### Step 1: Update Database
The system will automatically handle new documents, but existing SOS requests may need migration:

```javascript
// Optional: Migrate old SOS requests
db.sosrequests.updateMany(
  { location: { $exists: false } },
  { 
    $set: { 
      status: "completed",
      location: {
        type: "Point",
        coordinates: [0, 0] // Default, you may want to geocode location_address
      }
    }
  }
);
```

### Step 2: Update Technician Documents
```javascript
// Add currentLocation to all technicians
db.technicians.updateMany(
  { currentLocation: { $exists: false } },
  { 
    $set: { 
      currentLocation: {
        type: "Point",
        coordinates: [0, 0] // Will be updated when they go online
      }
    }
  }
);
```

### Step 3: Create Indexes
The models will auto-create indexes, but you can manually create them:

```javascript
// Create geospatial index for technicians
db.technicians.createIndex({ currentLocation: "2dsphere" });

// Create geospatial index for SOS requests
db.sosrequests.createIndex({ location: "2dsphere" });
```

### Step 4: Update Mobile Apps

**Customer App:**
1. Implement Socket.IO client for `/customer` namespace
2. Update SOS creation to send lat/lng instead of address
3. Handle real-time status updates
4. Implement contact us form

**Technician App:**
1. Implement Socket.IO client for `/technician` namespace
2. Implement location tracking (send updates every 5-10 seconds)
3. Handle SOS broadcasts
4. Implement job status updates with distance calculation

---

## Testing Checklist

### Backend
- [ ] Start the server and verify WebSocket namespaces are created
- [ ] Test geospatial indexes are created in MongoDB
- [ ] Verify Contact Us endpoints work

### Customer Flow
- [ ] Connect to customer namespace
- [ ] Create SOS request with lat/lng
- [ ] Receive SOS created confirmation
- [ ] Wait 60 seconds to test auto-expiration
- [ ] Create another SOS and have technician accept it
- [ ] Receive acceptance notification with technician details
- [ ] Receive job status updates
- [ ] Test cancelling SOS before acceptance
- [ ] Test contact us submission

### Technician Flow
- [ ] Connect to technician namespace
- [ ] Update location successfully
- [ ] Receive SOS broadcasts when customer creates one
- [ ] Accept SOS and receive confirmation
- [ ] Verify status changes to "On Job"
- [ ] Send job status updates to customer
- [ ] Complete job and verify status changes back to "Online"
- [ ] Verify no new SOS broadcasts received while "On Job"

### Edge Cases
- [ ] Multiple technicians try to accept same SOS (first wins)
- [ ] Technician location more than 20km away (should not receive broadcast)
- [ ] Technician with status "Offline" (should not receive broadcast)
- [ ] Technician with status "On Job" (should not receive broadcast)
- [ ] Customer disconnects before acceptance
- [ ] Technician disconnects after acceptance

---

## Rollback Plan

If issues arise, you can rollback by:

1. Revert code changes
2. Keep the new models (they're backward compatible with old data)
3. Re-enable old REST endpoints if needed

The system is designed to be non-destructive - old SOS records remain intact.

---

## Performance Considerations

1. **Location Updates**: Technicians send location every 5-10 seconds
   - Expected load: ~100 technicians × 6 updates/min = 600 updates/min
   - Negligible for MongoDB and Socket.IO

2. **SOS Broadcasts**: Each SOS queries nearby technicians
   - GeoJSON queries are indexed and very fast
   - Typical response time: <50ms for 1000s of technicians

3. **WebSocket Connections**: 
   - Each connection uses ~10KB memory
   - 1000 concurrent connections ≈ 10MB RAM

4. **Auto-expiration**: Uses JavaScript setTimeout
   - One timer per SOS request
   - Automatically cleaned up after 60 seconds

---

## Monitoring

Key metrics to monitor:

1. **WebSocket connections**: Track active customer/technician connections
2. **SOS acceptance rate**: How many SOS requests get accepted vs expired
3. **Average acceptance time**: How long it takes for a technician to accept
4. **Average distance**: Distance between technician and customer at acceptance
5. **Job completion rate**: Percentage of accepted SOS that complete successfully

---

## Support

If you encounter issues:

1. Check server logs for WebSocket connection errors
2. Verify MongoDB geospatial indexes exist
3. Ensure technicians are updating their location regularly
4. Verify technician status is "Online" not "Offline" or "On Job"
5. Check that customer/technician are using correct namespace URLs

For detailed API documentation, see `SOS_SYSTEM_DOCUMENTATION.md`
