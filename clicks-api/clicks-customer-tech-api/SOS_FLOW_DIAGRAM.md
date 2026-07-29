# SOS System Flow - Visual Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SOS SYSTEM COMPLETE FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

CUSTOMER APP                    SERVER                      TECHNICIAN APP
─────────────                   ──────                      ──────────────

[1. LOGIN]
POST /api/customers/login  ──>  [Authenticate]
                          <──   Token + Customer ID
Store Token
                                                            [2. LOGIN]
                                                            POST /api/technicians/login ──>
                                                                              [Authenticate]
                                                            <── Token + Technician ID
                                                            Store Token

                                                            [3. GO ONLINE]
                                                            PATCH /api/technicians/status
                                                            Body: { status: "Online" } ──>
                                                                              [Update Status]
                                                            <── Status: Online
                                                            
                                                            [4. START LOCATION TRACKING]
                                                            Every 5 seconds:
                                                            WS: updateLocation ─────────>
                                                            { lat, lng }      [Store Location]
                                                            
[5. CREATE SOS]
Get GPS Location
WS: createSOS ────────────────> [Create SOSRequest]
{ vehicle_id, lat, lng }        ├─> Find technicians within 20km
                                 ├─> Filter by status = "Online"
                                 ├─> Start 60s timer
                                 └─> Broadcast to technicians
WS: sosCreated <────────────    
{ sos_id, expiresAt }
Show: "Broadcasting..."
                                                            [6. RECEIVE SOS]
                                                            WS: newSOSRequest <─────────
                                                            { sos_id, customer, vehicle,
                                                              location, distance, expires_at }
                                                            Show Notification 🚨
                                                            Display: "Accept" button

                                                            [7. ACCEPT SOS]
                                                            Click Accept
                                                            WS: acceptSOS ──────────────>
                                                            { sos_id, technician_id }
                                                                              [Process Accept]
                                                                              ├─> Update SOS: accepted
                                                                              ├─> AUTO-CREATE JOB ✨
                                                                              │   status: "assigned"
                                                                              ├─> Technician: "On Job"
                                                                              └─> Notify customer

[8. ACCEPTANCE NOTIFICATION]                              
WS: sosAccepted <───────────    
{ job_id, technician,
  phone, distance }
Hide Loading
Show: "Ahmed accepted!"
Navigate to Tracking
                                                            WS: sosAcceptedConfirm <────
                                                            { job_id, customer, vehicle,
                                                              location }
                                                            Navigate to Job Screen

                                                            [10. UPDATE STATUS: EN ROUTE]
                                                            Click "Start Driving"
                                                            Every 10-15 seconds:
                                                            WS: updateJobStatus ────────>
                                                            { job_id, status: "en_route",
                                                              lat, lng, distance }
                                                                              [Update Job]
                                                                              └─> Notify customer

[LIVE TRACKING]
WS: jobStatusUpdate <───────
{ status: "en_route",
  distance: 4.8km,
  technician_location }
Update Map 🗺️
Show: "4.8 km away"
                                                            [11. MARK ARRIVED]
                                                            Click "I've Arrived"
                                                            POST /api/jobs/:id/arrive ─>
                                                                              [Update Job]
                                                                              └─> status: "arrived"
WS: jobStatusUpdate <───────                              <── Success
{ status: "arrived" }
Show: "Technician arrived!"
                                                            [12. START JOB]
                                                            Click "Start Work"
                                                            POST /api/jobs/:id/start ──>
                                                                              [Update Job]
                                                                              └─> status: "in_progress"
                                                            <── Success
                                                            Show Repair Form

                                                            [13. ADD REPAIRS]
                                                            Add Item 1:
                                                            POST /api/jobs/:id/repairs ─>
                                                            { description: "Battery",
                                                              quantity: 1, price: 150 }
                                                                              [Create Repair]
                                                            <── Repair Created
                                                            
                                                            Add Item 2:
                                                            POST /api/jobs/:id/repairs ─>
                                                            { description: "Labor",
                                                              quantity: 1, price: 50 }
                                                                              [Create Repair]
                                                            <── Repair Created

                                                            [14. CALCULATE TOTAL]
                                                            GET /api/jobs/:id/total ───>
                                                                              [Calculate]
                                                                              ├─> Base: $0
                                                                              ├─> Distance: $10
                                                                              ├─> Repairs: $200
                                                                              └─> Total: $210
                                                            <── Total Breakdown
                                                            Show: "$210"

                                                            [15. COMPLETE JOB]
                                                            Click "Mark Complete"
                                                            POST /api/jobs/:id/complete >
                                                                              [Complete Job]
                                                                              ├─> status: "completed"
                                                                              ├─> Update earnings
                                                                              └─> Update metrics
WS: jobStatusUpdate <───────                              <── Success
{ status: "completed" }
Show: "Job completed!"
                                                            Navigate to Payment

                                                            [16. CONFIRM PAYMENT]
                                                            Select: "Cash"
                                                            Click "Confirm Payment"
                                                            POST /api/jobs/:id/payment ─>
                                                            { notes: "Cash received" }
                                                                              [Process Payment]
                                                                              ├─> status: "paid"
                                                                              ├─> AUTO-GENERATE RECEIPT ✨
                                                                              └─> Technician: "Online"
                                                            <── Receipt Generated
                                                            Show Receipt
                                                            Status: ONLINE (can receive SOS)

[17. RATE JOB]
Show Rating Dialog
Select: 5 stars ⭐⭐⭐⭐⭐
Write: "Excellent service!"
POST /api/jobs/:id/rate ──────> [Save Rating]
{ rating: 5,                     └─> Update Job
  rating_description: "..." }
                            <─── Success
Show: "Thanks for rating!"

[18. VIEW RECEIPT]
GET /api/receipts/:id ────────> [Fetch Receipt]
                            <─── Receipt Data
Display Receipt 📄

┌─────────────────────────────────────────────────────────────────────────────┐
│                              FLOW COMPLETE ✅                                │
│                                                                             │
│  Technician Status: ONLINE → Can receive new SOS requests                  │
│  Customer: Can view job history and receipt                                │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════

LEGEND:
───>   REST API Call (HTTP)
─────> WebSocket Event (Real-time)
<───   Response
[...]  Server Action
WS:    WebSocket Event
✨     Automatic Server Action
🚨     Notification
🗺️     Map Update
📄     Document/Receipt

═══════════════════════════════════════════════════════════════════════════════

KEY TIMINGS:
• SOS Expiration: 60 seconds
• Location Updates: Every 5-10 seconds
• Status Updates: Every 10-15 seconds
• Search Radius: 20 km
• Auto Job Creation: Immediate on accept
• Auto Receipt: Immediate on payment

═══════════════════════════════════════════════════════════════════════════════

STATUS FLOW:
pending → assigned → en_route → arrived → in_progress → completed → paid

TECHNICIAN STATUS FLOW:
Offline → Online → On Job → Online (after payment)

═══════════════════════════════════════════════════════════════════════════════

WEBSOCKET EVENTS:

Customer Emits:                    Technician Emits:
• createSOS                        • updateLocation
• cancelSOS                        • acceptSOS
• register                         • updateJobStatus
                                   • register

Customer Listens:                  Technician Listens:
• sosCreated                       • newSOSRequest
• sosAccepted                      • sosAcceptedConfirm
• sosExpired                       • sosAlreadyAccepted
• jobStatusUpdate

═══════════════════════════════════════════════════════════════════════════════

REST API ENDPOINTS (POST/GET/PATCH):

Authentication:
• POST /api/customers/login
• POST /api/technicians/login
• PATCH /api/technicians/status

Job Management:
• POST /api/jobs/:id/arrive
• POST /api/jobs/:id/start
• POST /api/jobs/:id/repairs
• GET  /api/jobs/:id/total
• POST /api/jobs/:id/complete
• POST /api/jobs/:id/payment

Rating & History:
• POST /api/jobs/:id/rate
• GET  /api/jobs/customer/history
• GET  /api/sos/
• GET  /api/receipts/:id

═══════════════════════════════════════════════════════════════════════════════
```

## Alternative Scenario: SOS Expiration

```
CUSTOMER APP                    SERVER                      TECHNICIAN APPS
─────────────                   ──────                      ───────────────

[CREATE SOS]
WS: createSOS ────────────────> [Create SOSRequest]
                                 ├─> Broadcast to technicians
                                 └─> Start 60s timer
                                 
WS: sosCreated <────────────    
Show: "Broadcasting..."
Start Countdown: 60... 59... 58...
                                                            [ALL TECHNICIANS]
                                                            WS: newSOSRequest <──────
                                                            (But none click accept)
                                                            
[WAIT 60 SECONDS]               [Timer Expires]
                                 ├─> Update SOS: expired
                                 └─> Notify customer
                                 
WS: sosExpired <────────────    
{ sos_id, message }
Hide Loading
Show Dialog:
"No technicians available"
[Try Again] [Cancel]
```

## Alternative Scenario: Multiple Technicians Try to Accept

```
TECH 1                          SERVER                      TECH 2
──────                          ──────                      ──────

WS: newSOSRequest <────────                                 WS: newSOSRequest <────────
Click Accept                                                Click Accept (1 sec later)

WS: acceptSOS ──────────────> [First Accept Wins! ✅]
{ sos_id, tech_id_1 }          ├─> Create Job
                                └─> Notify Tech 1
                                                            WS: acceptSOS ──────────────>
                                                            { sos_id, tech_id_2 }
                                                                          [Already Accepted! ❌]
                                                                          └─> Reject acceptance

WS: sosAcceptedConfirm <────                                WS: sosAlreadyAccepted <────
{ job_id, customer, ... }                                   { sos_id, message }
✅ GOT THE JOB!                                             ❌ MISSED IT
Navigate to job screen                                      Show: "Already accepted"
                                                            Continue waiting...
```

---

## 🎯 Key Takeaways from Visual Flow

1. **WebSocket vs REST:** Real-time events (SOS, tracking) use WebSocket, management (repairs, payment) use REST
2. **Auto-Creation:** Job is automatically created when technician accepts SOS - no manual conversion
3. **Continuous Updates:** Location and status sent regularly for live tracking
4. **First-Come-First-Served:** First technician to accept gets the job
5. **Auto-Receipt:** Receipt is automatically generated on payment confirmation
6. **Status Changes:** Technician goes: Online → On Job → Online (circular)

---

**See Also:**
- `SOS_COMPLETE_FLOW_GUIDE.md` - Detailed implementation with code
- `SOS_QUICK_REFERENCE.md` - Quick lookup tables
- `API-Userflow-and-Endpoints.md` - API overview
