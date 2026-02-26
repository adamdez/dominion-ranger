# Call-Ready Auto Queue Rule

The Call-Ready Rule automatically enqueues leads into the dialer queue when they meet eligibility criteria. This enables wholesaling workflows where leads become dial-ready as soon as skip trace completes or scoring completes.

## Definition of Call-Ready

A lead/property is **call-ready** when all of the following are true:

| Criterion | Description | Config Source |
|-----------|-------------|---------------|
| **Score threshold** | Composite score ≥ configurable threshold | `CALL_READY_SCORE_THRESHOLD` (default: 40) |
| **Callable phone** | At least one phone number from `properties` or `property_contacts` with `dnd_calls = false` | — |
| **Not DNC** | Property not flagged DNC (`properties.dnc_flag`), and no contact has `property_contacts.dnd_calls = true` | — |
| **Cooldown** | Not contacted recently (last call or `contactedAt` outside cooldown window) | `CALL_READY_COOLDOWN_HOURS` (default: 24) |
| **Claim status** | Either unclaimed (pool) or claimed, depending on `CALL_READY_CLAIM_OWNED_ONLY` | `CALL_READY_CLAIM_OWNED_ONLY` (default: false) |

### Claim Status Modes

- **`CALL_READY_CLAIM_OWNED_ONLY=false`** (default): Only enqueue **unclaimed** leads (pool). Skip leads that have an `assigned_to` user.
- **`CALL_READY_CLAIM_OWNED_ONLY=true`**: Only enqueue **claimed** leads. Skip leads that have no `assigned_to`.

## Behavior

- **After skip trace completes**: When a lead is successfully skip-traced, the rule is evaluated. If the lead now has a callable phone and meets other criteria, it is auto-enqueued.
- **After scoring completes**: When a property is scored, the rule is evaluated. If the lead meets all criteria, it is auto-enqueued.
- **Enqueue decision logging**: Every evaluation (eligible or ineligible) is logged to `audit_log` with `action_type = 'call_ready.evaluated' and metadata including reasons`.

## Configuration (Environment Variables)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CALL_READY_ENABLED` | boolean | `false` | Master switch. Must be `true` for auto-enqueue. |
| `CALL_READY_SCORE_THRESHOLD` | number | `40` | Minimum composite score to be eligible. |
| `CALL_READY_COOLDOWN_HOURS` | number | `24` | Hours since last contact before lead can be re-enqueued. |
| `CALL_READY_CLAIM_OWNED_ONLY` | boolean | `false` | If `true`, only enqueue claimed leads. If `false`, only enqueue unclaimed (pool) leads. |

## Fields Used

### Properties

- `property.phone`, `property.phone_2`, `property.phone_3` — Primary phone sources
- `property.dnc_flag` — Agent-set DNC flag

### Property Contacts

- `property_contacts.phone` — Additional phones from skip trace
- `property_contacts.dnd_calls` — If `true`, that contact is blocked from calls
- `property_contacts.is_primary` — Used when selecting the best callable phone

### Lead Instances

- `lead_instances.status` — Must be `PROMOTED` or `ASSIGNED` (not `CLOSED`/`DEAD`) to be eligible
- `lead_instances.assigned_to` — Used for claim status filtering
- `lead_instances.contacted_at` — Used for cooldown

### Call Logs

- `call_logs.ended_at` — Used for cooldown (last contact timestamp)

### Scoring Records

- `scoring_records.composite_score` — Latest score (from most recent `scoring_records` row)

## Workflow Integration

- **Compliance gating**: Before a lead is set to `DIAL_READY`, the system runs `runComplianceGating`, which checks DNC and litigant. Only leads that pass compliance are enqueued.
- **State machine**: PROMOTED → COMPLIANCE_PENDING → DIAL_READY (or DEAD). The rule adds support for PROMOTED → COMPLIANCE_PENDING so unclaimed leads can be auto-enqueued.

## On-Demand Run

### Admin Endpoint

```
POST /api/admin/call-ready-sync?days=7
```

Requires: Admin or Manager role.

**Response:**
```json
{
  "ok": true,
  "days": 7,
  "evaluated": 42,
  "eligible": 8,
  "enqueued": 6,
  "errors": 0,
  "results": [...]
}
```

### CLI Script

```bash
npx tsx src/scripts/run-call-ready-rule.ts --days=7
```

## Audit Log Actions

- `call_ready.evaluated` — Every evaluation (eligible or ineligible), with reasons
- `call_ready.enqueued` — Successfully enqueued
- `call_ready.enqueue_failed` — Compliance gating failed

## Ineligibility Reasons

| Code | Meaning |
|------|---------|
| `NO_LEAD_INSTANCE` | No active lead instance for property |
| `ALREADY_DIAL_READY` | Lead already in dial queue |
| `SCORE_BELOW_THRESHOLD` | Composite score below configured threshold |
| `NO_CALLABLE_PHONE` | No callable phone (property or property_contacts) |
| `DNC` | Property or contact is on Do Not Call |
| `CONTACTED_RECENTLY` | Last contact within cooldown window |
| `ALREADY_CLAIMED` | Lead is claimed (when claimOwnedOnly=false) |
| `MUST_BE_CLAIMED` | Lead is unclaimed (when claimOwnedOnly=true) |
