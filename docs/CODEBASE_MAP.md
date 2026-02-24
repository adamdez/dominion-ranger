# Dominion Ranger — Codebase Map

**Generated:** 2026-02-23  
**Purpose:** Exact file paths and function names for key subsystems.

---

## 1. Database Connection

| Item | Location |
|------|----------|
| **Env vars** | `src/config/env.ts` — `DATABASE_URL` (required), `DATABASE_POOL_MIN`, `DATABASE_POOL_MAX` |
| **ORM** | Drizzle ORM 0.36 |
| **Client** | `pg` (node-postgres) Pool |
| **Connection** | `src/db/connection.ts` — `db` export, `checkDatabaseConnection()` |
| **Pool creation** | `src/db/connection.ts` lines 7–12 — `new pg.Pool({ connectionString: env.DATABASE_URL, ... })` |
| **Migrations** | `src/db/migrations/` — Drizzle Kit, `drizzle.config.ts` uses `process.env.DATABASE_URL` |

---

## 2. Ingestion / Import

| Item | Location |
|------|----------|
| **CSV adapter** | `src/ingestion/adapters/csv-import.ts` — `CsvAdapter` class, `fetchRecords()` |
| **Default import dir** | `./data/imports` (line 29 of csv-import.ts) |
| **Adapter registry** | `src/ingestion/adapters/registry.ts` — `initializeAdapters()`, registers CsvAdapter as `csv` |
| **Pipeline** | `src/ingestion/pipeline.ts` — `runAdapterPipeline()`, `processRecord()` |
| **API trigger** | `src/api/routes/ingestion.ts` — `POST /api/ingestion/run` — queues job to BullMQ |
| **Queue** | `src/jobs/queues.ts` — `ingestionQueue` (ranger-ingestion) |
| **Worker** | `src/jobs/worker.ts` — `ingestionWorker` calls `runAdapterPipeline()` |
| **Standalone script** | `src/scripts/reimport-csv.ts` — `npx tsx src/scripts/reimport-csv.ts spokane.csv` — **bypasses Redis/API**, writes directly to DB |
| **Bootstrap script** | `src/scripts/bootstrap-first-dial.ts` — `npm run bootstrap:first-dial [file.csv]` — full pipeline (import → score → promote → claim → DIAL_READY) without Redis |

**Active path for CSV:**  
- **With Redis + worker:** `POST /api/ingestion/run` with `{ "adapter": "csv", "options": { "file": "spokane.csv" } }`  
- **Without Redis:** `npx tsx src/scripts/reimport-csv.ts spokane.csv` (script only; **does not run scoring or promotion**)

---

## 3. Scoring

| Item | Location |
|------|----------|
| **Core service** | `src/modules/scoring/service.ts` — `scoreProperty(dominionLeadId)` |
| **Event wiring** | `src/events/wiring.ts` — `flushScoreQueue()`, `enqueueForScoring()` — debounced auto-score after distress events |
| **API batch** | `src/api/routes/scoring.ts` — `POST /api/scoring/run` — batch scores unscored properties (no Redis) |
| **API promote** | `src/api/routes/scoring.ts` — `POST /api/scoring/promote` — `replayAllPromotions()` |
| **BullMQ scoring** | `src/jobs/worker.ts` — `scoringWorker` — used when pipeline/events enqueue scoring jobs |
| **Scoring model** | `src/db/seeds/scoring-model-v1.ts` — seeded via `npm run db:seed` |

**Active path for batch scoring (empty DB → scored):**  
`POST /api/scoring/run` with `{ "limit": 10000 }` — runs synchronously in API, no worker required.

---

## 4. Promotion → Leads / Dial Queue

| Item | Location |
|------|----------|
| **Promotion service** | `src/modules/promotion/service.ts` — `evaluateForPromotion(dominionLeadId, scoringResult)` |
| **Lead instance creation** | `src/events/wiring.ts` — `domainEvents.on('lead.promoted', ...)` → `createLeadInstance()` |
| **Workflow service** | `src/modules/workflow/service.ts` — `createLeadInstance()`, `claimLead()`, `runComplianceGating()`, `transitionLead()` |
| **Dial queue query** | `src/api/routes/leads.ts` — `GET /api/dial-queue` — joins `lead_instances` + `scoring_records`, filters `status = DIAL_READY` |
| **Promotion replay** | `src/modules/promotion/replay.ts` — `replayAllPromotions()` |

**Flow:** Score ≥ threshold → `evaluateForPromotion` inserts `promoted_leads` → emits `lead.promoted` → `createLeadInstance` inserts `lead_instances` (status PROMOTED).  
**To reach DIAL_READY:** Claim → ASSIGNED → `runComplianceGating` → DIAL_READY (or DEAD if DNC/litigator).

---

## 5. Twilio Calling + Inbound SMS

| Item | Location |
|------|----------|
| **Twilio config** | `src/config/twilio.ts` — `getTwilioClient()`, `isTwilioConfigured()`, `TWILIO_PHONE_NUMBER`, `isClientConfigured()` |
| **Env vars** | `src/config/env.ts` — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_TWIML_APP_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET` |
| **Call service** | `src/modules/dialer/call-service.ts` — `generateClientToken()`, `getCallablePhone()`, `initiateCall()`, `updateCallStatus()`, `generateVoiceTwiml()` |
| **SMS service** | `src/modules/dialer/sms-service.ts` — `sendSms()`, `logInboundSms()`, `updateSmsStatus()`, `getSmsHistory()` |
| **Dialer API** | `src/api/routes/dialer.ts` — `GET /api/dialer/token`, `POST /api/dialer/call`, `POST /api/dialer/voice` (TwiML), `POST /api/dialer/status` (webhook) |
| **SMS API** | `src/api/routes/sms.ts` — `POST /api/sms/send`, `POST /api/sms/status`, `POST /api/sms/inbound` (webhook) |
| **Inbound SMS routing** | `src/modules/dialer/sms-service.ts` — `logInboundSms(fromPhone, toPhone, body)` — matches `toPhone` to property/contact, returns `dominionLeadId` |

---

## 6. Dashboard Counts

| Item | Location |
|------|----------|
| **Total properties** | `src/api/routes/system.ts` — `GET /api/system/stats` — `getPropertyCount()` from `src/modules/properties/service.ts` |
| **Property count helper** | `src/modules/properties/service.ts` — `getPropertyCount()` |
| **Lead stats** | `src/api/routes/leads.ts` — `GET /api/leads/stats` — counts by `lead_instances.status` (total, active, dialReady, promoted, closedThisMonth) |
| **Frontend hooks** | `frontend/src/hooks/use-system.ts` → `/api/system/stats`, `frontend/src/hooks/use-dashboard.ts` → `/api/leads/stats` |
| **Dashboard page** | `frontend/src/app/page.tsx` — uses `useSystemStats`, `useLeadStats`, `usePipelineStats` |

**Auth:** In dev, `/api/system/stats` skips auth (`src/api/server.ts` line 57). `/api/leads/stats` requires `properties.read`.

---

## Single Best Next Change: Empty DB → First Dial

**Goal:** Get from empty DB to placing the first dialer call.

**Recommended change:** Add a **one-shot bootstrap script** that runs the full pipeline for a single CSV file without Redis, and ensures at least one lead reaches DIAL_READY with a phone number.

**Why:**  
- Reimport script populates properties + events but **does not score or promote**.  
- API ingestion requires Redis + worker.  
- Manual steps (score → promote → claim → compliance → call) are error-prone for a novice.

**Files to edit:**

1. **`src/scripts/bootstrap-first-dial.ts`** (new)  
   - Read CSV from `data/imports/` (or path arg).  
   - Reuse logic from `reimport-csv.ts` for property/event upsert.  
   - After each record (or batch): call `scoreProperty()`, `evaluateForPromotion()`.  
   - After full import: call `replayAllPromotions()` to ensure lead_instances exist.  
   - Find one lead with `status = PROMOTED` and `phone` on property or contact.  
   - Call `claimLead()`, `runComplianceGating()`, transition to DIAL_READY.  
   - Log: `dominionLeadId`, `leadInstanceId`, and instruction to `POST /api/dialer/call`.

2. **`src/ingestion/adapters/csv-import.ts`**  
   - Add column mapping for Kootenai Export format (`Type, Address, City, Sq Ft, ...`) if that CSV is to be supported by the adapter.

3. **`package.json`**  
   - Add script: `"bootstrap": "tsx src/scripts/bootstrap-first-dial.ts"`

**Bootstrap script (no Redis):**  
`npm run bootstrap:first-dial [filename.csv]` — runs the full pipeline in one shot:
1. Imports CSV from `./data/imports` (uses newest file if no arg)
2. Creates distress events (idempotent)
3. Batch scores all imported properties
4. Runs promotion evaluation (emits `lead.promoted` → creates lead instance)
5. Claims one lead, runs compliance gating, transitions to DIAL_READY
6. Prints: property count, distress_event count, scoring_record count, promoted_lead count, lead_instance_id, dominion_lead_id, callable phone

**Success output example:**
```
╔══════════════════════════════════════════════════════════╗
║   BOOTSTRAP SUCCESS                                      ║
╚══════════════════════════════════════════════════════════╝

   property count:        150
   distress_event count:   89
   scoring_record count:   150
   promoted_lead count:    12
   lead_instance_id:       abc-123-...
   dominion_lead_id:       def-456-...
   callable phone:         +15095550123

   ✓ Ready to dial. Use GET /api/dial-queue and place a call.
```

If no callable phone: *"No callable phone found; add property_contacts or property.phone, then rerun."*

**Alternative (minimal change):**  
If Redis + worker are already running:  
1. Copy CSV to `data/imports/spokane.csv`.  
2. `POST /api/ingestion/run` with `{ "adapter": "csv", "options": { "file": "spokane.csv" } }`.  
3. `POST /api/scoring/run` with `{ "limit": 10000 }`.  
4. `POST /api/scoring/promote`.  
5. In UI: claim a lead, run compliance, transition to DIAL_READY, place call.

**Critical dependency:** Property or `property_contacts` must have a phone number. The Spokane PropertyRadar CSV may not include phone; the Kootenai Export does not. Skip-trace or manual contact entry may be required before the first call.
