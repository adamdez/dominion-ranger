# Dominion Ranger — Architectural Decision Log

## Current Phase: Phase 1 — Revenue Engine
## Status: Core Build Complete — Awaiting DB Deploy + API Key Wiring

---

## Completed Components

| Component | Status | Files |
|-----------|--------|-------|
| Project scaffold | ✅ | package.json, tsconfig, drizzle.config |
| Environment config | ✅ | src/config/ |
| Database schema (10 tables) | ✅ | src/db/schema/ |
| Database connection pool | ✅ | src/db/connection.ts |
| Core library (UUID v7, dates, address, errors) | ✅ | src/lib/ |
| Domain event bus | ✅ | src/events/ |
| Properties module (identity resolution) | ✅ | src/modules/properties/ |
| Distress events module (append-only) | ✅ | src/modules/distress-events/ |
| Signal accumulation module | ✅ | src/modules/signals/ |
| Scoring engine (config-driven, dual-layer) | ✅ | src/modules/scoring/ |
| Promotion engine (threshold, tiers) | ✅ | src/modules/promotion/ |
| Sentinel hooks (webhook, status sync) | ✅ | src/modules/sentinel/ |
| Compliance module (audit, DNC/litigator stubs) | ✅ | src/modules/compliance/ |
| RBAC module | ✅ | src/modules/rbac/ |
| Ingestion adapters (PropertyRadar, Regrid, ForeclosureRadar, REISkip) | ✅ | src/ingestion/adapters/ |
| Ingestion pipeline orchestrator | ✅ | src/ingestion/pipeline.ts |
| BullMQ job queues + worker | ✅ | src/jobs/ |
| Fastify API (7 route files) | ✅ | src/api/ |
| Auth middleware (RBAC) | ✅ | src/api/middleware/ |
| Database seeds (scoring model v1) | ✅ | src/db/seeds/ |
| Event wiring | ✅ | src/events/wiring.ts |
| Application entrypoint | ✅ | src/index.ts |
| Unit tests (dates, address, IDs) | ✅ | tests/unit/ |

## Pending Components

| Component | Priority | Notes |
|-----------|----------|-------|
| Run migrations against real DB | HIGH | Need DATABASE_URL |
| Wire live API keys for adapters | HIGH | Founder provides keys |
| Adapter API integration (actual HTTP calls) | HIGH | Skeleton in place, need API docs access |
| Integration tests (DB-backed) | MEDIUM | Need test database |
| File upload adapter (CSV ingestion) | MEDIUM | Phase 2 convenience |
| DNC registry integration | MEDIUM | Need provider |
| Litigator list integration | MEDIUM | Need provider |
| JWT auth (replace bootstrap token) | LOW | Phase 2 |

## Key Design Decisions

### DD-001: UUID v7 for all primary keys
- **Rationale**: Charter-mandated. Time-sortable, no collisions, works across Dominion Suite.
- **Status**: Implemented

### DD-002: Append-only distress events
- **Rationale**: Charter-mandated. Events never overwritten. Full audit trail preserved.
- **Status**: Implemented. No UPDATE/DELETE operations exist for distress_events table.

### DD-003: Versioned scoring records (append-only)
- **Rationale**: Charter requires historical scores. Each re-score creates new row.
- **Status**: Implemented. Latest score query uses ORDER BY created_at DESC LIMIT 1.

### DD-004: Composite key (APN + County) for identity resolution
- **Rationale**: APN is county-scoped. Address-only matching is too fragile for Phase 1.
- **Phase 2**: Add fuzzy address matching for records without APN.

### DD-005: Config-driven scoring weights in DB table
- **Rationale**: Charter prohibits hardcoded scoring. Weights stored in scoring_model_configs.
- **Status**: v1.0 model seeded. New versions can be added without code changes.

### DD-006: REISkip as enrichment adapter, not ingestion adapter
- **Rationale**: REISkip provides contact data, not distress signals. Different interface.
- **Status**: Separate EnrichmentAdapter interface.

### DD-007: Exponential time decay with configurable half-life per event type
- **Rationale**: Different event types decay at different rates. NOD decays faster than bankruptcy.
- **Status**: Implemented. Floor of 0.05 prevents zero-weight signals.

### DD-008: In-process domain events + BullMQ for async work
- **Rationale**: Domain events for immediate side effects (audit logging). BullMQ for heavy work (ingestion, batch scoring).
- **Status**: Both implemented.

### DD-009: Sentinel webhook fires only if URL configured
- **Rationale**: Charter: "If sentinel_webhook_url exists → POST. If not → store event only."
- **Status**: Implemented. Zero-config Sentinel integration.

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| No live API keys yet | HIGH | Adapter skeletons ready, normalization logic in place |
| Identity resolution limited to APN+County | MEDIUM | Phase 2: fuzzy address matching |
| No integration tests yet | MEDIUM | Need test database instance |
| Single-node BullMQ | LOW | Adequate for Phase 1 scale |

## Scoring Model v1.0 Summary

- Confirmed weights: 0.60–0.95 (NOD highest at 0.95)
- Predictive weights: 0.15–0.40 (divorce filing highest at 0.40)
- Time decay: exponential with floor 0.05
- Promotion threshold: 40 (composite score)
- Tier A: ≥80, Tier B: ≥60, Tier C: ≥40
- Confidence model: signal count + diversity + source diversity + confirmed presence bonus
