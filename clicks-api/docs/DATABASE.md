# Clicks API — Database & data points

MongoDB Atlas via Mongoose · schema in `clicks-shared/models` · no SQL migrations

| | |
| --- | --- |
| Shared models | **27** |
| APIs (same DB) | **2** |
| Engine | MongoDB |
| ODM | Mongoose 7 |

Two Express services share one database: `clicks-customer-tech-api` (:5001) and `clicks-admin-api` (:5000). Redis is optional for Socket.IO only — not a data store. Azure Blob URLs are stored as strings. There is no clickstream analytics model; “Clicks” is the product name.

---

## Architecture

| Layer | Detail |
| --- | --- |
| Connection | `process.env.MONGODB_URI` (required) |
| Local default | `mongodb://127.0.0.1:27017/clicks` |
| Staging / prod examples | `clicks_staging` · `clicks` |
| Schema source | [`clicks-shared/models/*.js`](../clicks-shared/models) (code-defined) |
| Migrations | None — indexes sync on connect / seed; TTL on OTP / PasswordReset |
| Seeds | [`scripts/seed-*.js`](../scripts) |
| Legacy unused | `clicks-admin-api` `Client` model (not wired to routes) |

```
clicks-admin-api (:5000) ──┐
                           ├──► MongoDB (clicks)
clicks-customer-tech-api ──┘
        (:5001)
              └── Redis (optional) → Socket.IO adapter only
```

---

## Collections by domain

### Users & auth actors

| Domain | Model | Mongo collection | Role |
| --- | --- | --- | --- |
| Users | Customer | `customers` | End-user accounts (phone/email auth, FCM, deletion request) |
| Users | Technician | `technicians` | Field techs with geo presence, docs, expertise, performance |
| Users | Admin | `admins` | Dispatch / ops staff with RBAC roles |
| B2B | Business | `businesses` | Company accounts with cut settings |
| B2B | BusinessUser | `businessusers` | Portal login for a Business (`owner` \| `staff`) |
| Partners | Partner | `partners` | Acquisition partners (period caps, accrual, FCM) |

### Core ops

| Domain | Model | Mongo collection | Role |
| --- | --- | --- | --- |
| Core ops | SOSRequest | `sosrequests` | Emergency roadside request with geo broadcast + claim lifecycle |
| Core ops | Job | `jobs` | Work order: assignment, status machine, payment, rating, B2B cut, partner attribution |

### Fleet & catalog

| Domain | Model | Mongo collection | Role |
| --- | --- | --- | --- |
| Fleet | CustomerVehicle | `customervehicles` | Vehicles owned by customers (used in SOS/jobs) |
| Fleet | Vehicle | `vehicles` | Fleet / tech company vehicles |
| Catalog | VehicleMake | `vehiclemakes` | Vehicle make catalog |
| Catalog | VehicleModel | `vehiclemodels` | Vehicle model catalog (unique per make) |
| Catalog | VehicleType | `vehicletypes` | Vehicle type catalog (SUV, sedan, …) |
| Catalog | Source | `sources` | Job lead sources with embedded `subSources` |
| Catalog | VehicleInsurance | `vehicleinsurances` | Standalone insurance registry (not linked to Customer) |
| Catalog | Subscription | `subscriptions` | Plate/VIN service plans (tech/admin created) |

### Finance

| Domain | Model | Mongo collection | Role |
| --- | --- | --- | --- |
| Finance | RepairProcedure | `repairprocedures` | Line items / parts added during a job |
| Finance | Receipt | `receipts` | Job receipts + cash settlements |
| Finance | TechnicianEarnings | `technicianearnings` | Earnings ledger (also mirrored on `Technician.performance`) |
| Finance | PartnerEarning | `partnerearnings` | One accrual row per attributed completed job |
| Finance | PartnerWithdrawal | `partnerwithdrawals` | Offline cash withdraw requests (earnings / investment / both) |

### Auth tokens

| Domain | Model | Mongo collection | Role |
| --- | --- | --- | --- |
| Auth | OTPVerification | `otpverifications` | SMS OTP for customer/tech registration & reset (TTL) |
| Auth | PasswordReset | `passwordresets` | Admin email reset tokens (TTL) |

### Support & CMS

| Domain | Model | Mongo collection | Role |
| --- | --- | --- | --- |
| Support | SupportTicket | `supporttickets` | Customer support tickets optionally tied to a job |
| Support | ContactUs | `contactuses` | General contact form submissions |
| CMS | FAQ | `faqs` | CMS FAQ entries |
| CMS | PrivacyPolicy | `privacypolicies` | Versioned privacy policy content |
| CMS | TermsAndConditions | `termsandconditions` | Versioned terms content |

**Not modeled as collections:** Notification inbox (API stubs return empty arrays); FCM device tokens live on `Customer`, `Technician`, and `Partner`.

---

## Job (core ops)

Work order: assignment, status machine, payment, rating, B2B cut, partner attribution.

**Indexes:** `{ job_status, assignedTechnician, createdAt }` · `{ customer_id, createdAt }` · `{ business_id, createdAt }`

| Field | Type | Notes |
| --- | --- | --- |
| `clientName` / `clientMobileNumber` | String | required (walk-in ok) |
| `clientEmail` | String | optional |
| `customer_id` / `customer_vehicle_id` | ObjectId | optional |
| `vehicleMake` / `vehicleModel` / `vehicleYear` / `licensePlate` / `vinNumber` | String / Number | snapshot at job create |
| `issue` / `location` | String | required (`location` is address text, not GeoJSON) |
| `dateTime` | Date | required |
| `jobType` | enum | RSA: `Towing` \| `Jump start` \| `Flat tire` \| `Lockout` \| `Fuel delivery` \| `Battery replacement` \| `Accident assistance` (+ legacy: `Tires` \| `Engines` \| `Gearbox` \| `keyless_car_opening` \| `tire_change`) |
| `assignedTechnician` | ObjectId→Technician | optional |
| `price` | Number | required |
| `source` | ObjectId→Source | required |
| `subSource` | String | partner / lead sub-source name |
| `partner_id` | ObjectId→Partner | attribution when job credits a partner |
| `job_status` | enum | `pending` → … → `completed` \| `cancelled` |
| `payment_status` | `unpaid` \| `paid` | default unpaid |
| `payment_method` | `card` \| `wallet` \| `cash` \| `fawran` | optional |
| lifecycle `*_at` stamps | Date | `assigned_at` … `paid_at` |
| `rating` / `rating_description` | Number 1–5 / String | optional |
| `sos_request_id` | ObjectId→SOSRequest | optional |
| `business_id` / `businessName` / `created_by_business_user` | ObjectId / String | business portal jobs |
| `businessCutType` / `businessCutPercent` | `revenue`\|`profit` / 0–100 | snapshot at create |
| `created_by_technician` / `createdByTechnicianName` | ObjectId / String | technician-app created jobs |
| `completion_notes` / `completion_photos` | String / [String] | optional |
| `customerSignatureUrl` / `customerSignedAt` / `customerSignatureInvalidatedAt` | String / Date | e-signature before close |

---

## Entity relationships

| From | Cardinality | To |
| --- | --- | --- |
| Customer | 1 → N | CustomerVehicle, SOSRequest, Job, SupportTicket, ContactUs, Receipt |
| CustomerVehicle | N → 1 | Customer, VehicleMake, VehicleType, VehicleModel |
| SOSRequest | N → 1 | Customer, CustomerVehicle?, Technician?, Admin?, Job? |
| Job | N → 1 | Customer?, Technician?, Source, SOSRequest?, Business?, Partner?, BusinessUser?, Technician (creator)? |
| Job | 1 → N | RepairProcedure; 0..1 Receipt (partial unique on `job_id`) |
| Technician | ↔ 1 | Vehicle (`assignedVehicle` / `assignedTechnician`) |
| Technician | 1 → 1 | TechnicianEarnings (logical) |
| Vehicle | N → 1 | VehicleMake, VehicleModel, VehicleType? |
| VehicleInsurance | N → 1 | VehicleMake, VehicleModel (standalone) |
| Admin | 1 → N | SOSRequest.claimed_by; Subscription.created_by_admin |
| Business | 1 → N | BusinessUser, Job |
| Business | N → 1 | Source (`defaultSource`) |
| Partner | 1 → N | PartnerEarning, PartnerWithdrawal, Job (`partner_id`) |
| PartnerEarning | N → 1 | Partner; 1 → 1 Job (`job` unique) |
| PartnerWithdrawal | N → 1 | Partner; reviewedBy → Admin? |
| Subscription | N → 1 | Technician? / Admin? (creators) |

---

## Core data flow — SOS → Job → Receipt

| Step | Action | Data written |
| --- | --- | --- |
| 1 | Customer creates SOS | SOSRequest `pending` + GeoJSON + broadcast window |
| 2 | Admin claims | status `in_call`, `claimed_by` Admin |
| 3 | Job created & assigned | Job linked via `sos_request_id`; SOS → `accepted` |
| 4 | Tech accept → complete | `en_route` → `arrived` → `in_progress` → `completed` |
| 5 | Payment + receipt | `payment_status` paid; Receipt (+ RepairProcedure lines) |
| 6 | Customer rates | Job.rating 1–5 |

**Partner accrual (parallel path):** completed Google + partner-named `subSource` jobs of type `keyless_car_opening` / `tire_change` may credit `Partner.accruedTotal` and insert `PartnerEarning` (capped by period).

**Business portal path:** BusinessUser creates Job with `business_id` + cut snapshot; admin assigns technician as usual.

---

## Enums & status machines

| Field | Values |
| --- | --- |
| Admin.role | `Admin`, `Super Admin`, `Job Dispatcher`, `Coordinator`, `Call Center Agent` |
| Customer.status | `Active`, `Inactive` |
| expertise / jobType (create) | `Towing`, `Jump start`, `Flat tire`, `Lockout`, `Fuel delivery`, `Battery replacement`, `Accident assistance` |
| expertise / jobType (legacy) | `Tires`, `Engines`, `Gearbox` (+ job-only: `keyless_car_opening`, `tire_change`) |
| Technician.applicationStatus | `Approved`, `Rejected`, `Pending` |
| Technician.currentStatus | `Online`, `Offline`, `On Job` |
| SOSRequest.status | `pending`, `in_call`, `accepted`, `cancelled`, `expired`, `completed` |
| Job.job_status | `pending` → `assigned` → `accepted` → `en_route` → `arrived` → `in_progress` → `completed` \| `cancelled` |
| Job.payment_status | `unpaid`, `paid` |
| Job.payment_method | `card`, `wallet`, `cash`, `fawran` |
| Job.businessCutType | `revenue`, `profit` |
| Business.cutType | `revenue`, `profit` |
| BusinessUser.role | `owner`, `staff` |
| Partner.status | `active`, `capped`, `frozen`, `inactive` |
| Receipt.payment_status | `pending`, `paid`, `confirmed` |
| SupportTicket.status | `open`, `in_progress`, `resolved`, `closed` |
| ContactUs.status | `pending`, `in_progress`, `resolved` |
| OTP.purpose | `registration`, `password_reset`, `verification` |
| Insurance.subscriptionType | `Full Coverage`, `Liability Only` |
| Subscription.status | `active`, `expired`, `cancelled` |

---

## Auth actors

| Actor | Collection | Notes |
| --- | --- | --- |
| Customer | `customers` | phone/email + password · OTP · JWT `role=customer` |
| Technician | `technicians` | email/phone · `applicationStatus` gate · JWT `role=technician` |
| Admin | `admins` | email + password · access/refresh JWT · PasswordReset |
| Partner | `partners` | email + password · JWT `role=partner` (admin-api partner portal) |
| Business | `businessusers` | email + password · JWT `role=business` + `business_id` |

---

## Notable indexes

| Type | Models |
| --- | --- |
| Unique field | Admin.email, Customer phone/email/`client_id` (sparse), Technician.email, Vehicle plate/VIN, VehicleMake.makeName, VehicleType.typeName, Source.mainSourceName, VehicleInsurance plate/VIN, BusinessUser.email, Partner.name, PartnerEarning.job |
| Unique compound | VehicleModel `{ makeId, modelName }` |
| Partial unique | Receipt `{ job_id }` (ObjectId only) |
| TTL | OTPVerification, PasswordReset (`expiresAt`, `expireAfterSeconds: 0`) |
| 2dsphere | Technician.currentLocation, SOSRequest.location |
| Compound query | Job (3), SOSRequest (2), Partner `{ status, isActive }`, PartnerEarning `{ partner, createdAt }`, Subscription `{ plateNumber, status }` |

---

## Seeds

| Script | Purpose |
| --- | --- |
| `scripts/seed-demo-data.js` | Demo customer/tech/admin + minimal catalog |
| `scripts/seed-local-admin.js` | Local admin account |
| `scripts/seed-local-techs.js` | Local technician accounts |
| `scripts/seed-production-accounts.js` | Production-style demo accounts |
| `scripts/seed-business-portal.js` | Business + BusinessUser demo |
| `scripts/seed-partner.js` | Demo Partner |
| `scripts/seed-hatla2ee-vehicle-catalog.js` | Hatla2ee Qatar make/model catalog (~170 makes / ~2413 models) |

Typical local: `MONGODB_URI=mongodb://127.0.0.1:27017/clicks node scripts/<script>.js`

---

## Notable schema gaps (current)

| Finding | Impact |
| --- | --- |
| `Technician.performance` vs `TechnicianEarnings` | Duplicated earnings counters; controllers treat TechnicianEarnings as money source of truth |
| Job.location is String, SOS is GeoJSON | Address text vs coordinates — different shapes |
| Legacy `Client` model in admin-api | Unused; replaced by Customer (`client_id`) |
| No Notification / analytics collections | FCM tokens on actors; notification routes are stubs |
| Vehicle catalog size | Seeded from Hatla2ee; admin CRUD still available for overrides |

---

## Changelog vs older “22 collections” doc

| Topic | Older doc | Current |
| --- | --- | --- |
| Shared models | 22 | **27** |
| Auth actors | Customer, Technician, Admin | + **Partner**, **Business** |
| Business model | Missing (gap) | **Business** + **BusinessUser** exist; Job cut fields remain |
| VehicleModel uniqueness | Global `modelName` unique (gap) | Compound `{ makeId, modelName }` |
| Partner domain | Absent | **Partner** + **PartnerEarning** + Job `partner_id` |
| Subscriptions | Absent | **Subscription** model |
| Job.jobType | Tires / Engines / Gearbox | + RSA types + partner job types |
| APIs / Redis / SOS→Job flow | Same | Same |
