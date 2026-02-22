# Dominion Ranger — Architecture

## System Overview

Dominion Ranger is a deterministic acquisition operating system for real estate distress detection and lead intelligence. It ingests distress signals from multiple data sources, scores properties using a config-driven tri-score model, promotes high-scoring leads through a threshold engine, and manages the acquisition lifecycle through a stateful workflow with compliance gating.

The system prioritizes **permanence**, **determinism**, and **rewrite resistance** over speed of feature delivery.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript 5.7, ESM |
| API | Fastify 5 |
| ORM | Drizzle ORM 0.36 + drizzle-kit |
| Database | PostgreSQL (Neon serverless) |
| Queue | BullMQ 5 + ioredis (Upstash Redis) |
| Validation | Zod |
| Testing | Vitest |
| Logging | Pino |
| CI | GitHub Actions |

## Domain Boundary Diagram

```mermaid
flowchart TD
    subgraph signalDomain [Signal Domain]
        Adapters["Ingestion Adapters\n(PropertyRadar, Regrid,\nForeclosureRadar, CSV)"]
        Pipeline["Ingestion Pipeline"]
        Identity["Identity Resolution\n(APN + County upsert)"]
    end

    subgraph scoringDomain [Scoring Domain]
        ScoringEngine["Scoring Engine\n(Tri-Score Model)"]
        ScoringConfig["scoring_model_configs"]
        ScoringReplay["Scoring Replay"]
    end

    subgraph promotionDomain [Promotion Domain]
        PromotionEngine["Promotion Engine\n(Threshold + Tier)"]
        PromotionReplay["Promotion Replay"]
    end

    subgraph workflowDomain [Workflow Domain]
        StateMachine["State Machine\n(10 states)"]
        Compliance["Compliance Gating\n(DNC + Litigator)"]
        Assignment["Assignment + Claiming\n(Optimistic Locking)"]
    end

    Adapters --> Pipeline
    Pipeline --> Identity
    Identity -->|"writes"| PropertiesTable[(properties)]
    Pipeline -->|"writes"| EventsTable[(distress_events\nAPPEND-ONLY)]

    EventsTable -->|"reads"| ScoringEngine
    PropertiesTable -->|"reads"| ScoringEngine
    ScoringConfig -->|"reads"| ScoringEngine
    ScoringEngine -->|"writes"| ScoringTable[(scoring_records\nAPPEND-ONLY)]

    ScoringTable -->|"reads"| PromotionEngine
    PromotionEngine -->|"writes"| PromotedTable[(promoted_leads)]
    PromotionEngine -->|"emits lead.promoted"| StateMachine

    StateMachine -->|"writes"| LeadTable[(lead_instances)]
    Compliance -->|"gates"| StateMachine
    Assignment -->|"manages"| LeadTable
```

## 7 Non-Negotiable Invariants

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | `distress_events` is append-only | PostgreSQL BEFORE UPDATE/DELETE triggers raise exception |
| 2 | `scoring_records` is append-only | PostgreSQL BEFORE UPDATE/DELETE triggers raise exception |
| 3 | Scoring version always preserved | Every `scoring_records` row stores `score_model_version`; old rows never modified |
| 4 | Identity separation enforced | `properties` = permanent identity (APN+County), `lead_instances` = temporal lifecycle |
| 5 | Idempotent ingestion guaranteed | ON CONFLICT DO UPDATE for properties, ON CONFLICT DO NOTHING for events (fingerprint dedup) |
| 6 | Deterministic replay possible | Same events + same config = identical scores and promotions, no randomness |
| 7 | Compliance gating before dial | DNC + litigator checks required before any lead enters dial queue |

## Lead Instance State Machine

```mermaid
stateDiagram-v2
    [*] --> PROMOTED
    PROMOTED --> ASSIGNED
    PROMOTED --> DEAD
    ASSIGNED --> COMPLIANCE_PENDING
    ASSIGNED --> DEAD
    COMPLIANCE_PENDING --> DIAL_READY : compliance cleared
    COMPLIANCE_PENDING --> DEAD : DNC or litigator flagged
    DIAL_READY --> DIALING
    DIAL_READY --> DEAD
    DIALING --> CONTACTED
    DIALING --> DIAL_READY : no answer
    DIALING --> DEAD
    CONTACTED --> OFFER_SENT
    CONTACTED --> DEAD
    OFFER_SENT --> CONTRACTED
    OFFER_SENT --> DEAD
    CONTRACTED --> CLOSED
    CONTRACTED --> DEAD
    CLOSED --> [*]
    DEAD --> [*]
```

**Terminal states:** CLOSED (successful acquisition), DEAD (disqualified/dropped)

**Concurrency protection:** All transitions use optimistic locking via `version` column. Two concurrent claims on the same lead result in exactly one success.

## Directory Structure

```
dominion-ranger/
├── .github/workflows/ci.yml    # CI pipeline (lint, typecheck, test, migration check)
├── src/
│   ├── api/                     # Fastify HTTP routes (thin — delegates to services)
│   │   ├── middleware/auth.ts
│   │   └── routes/              # 7 route files
│   ├── config/                  # Environment, logging
│   ├── db/
│   │   ├── schema/              # 11 Drizzle table definitions
│   │   ├── seeds/               # Scoring model v1.0 seed
│   │   ├── migrations/          # 4 SQL migration files (0000–0003)
│   │   ├── invariants.ts        # Append-only trigger application
│   │   └── connection.ts
│   ├── events/                  # Domain event bus + wiring
│   ├── ingestion/               # Signal domain — adapters + pipeline
│   │   └── adapters/            # PropertyRadar, Regrid, ForeclosureRadar, REISkip
│   ├── jobs/                    # BullMQ queues + workers
│   ├── lib/                     # Shared utilities (address, dates, ids, fingerprint, errors)
│   ├── modules/                 # Domain services
│   │   ├── compliance/          # DNC, litigator, audit logging
│   │   ├── distress-events/     # Event store (append-only)
│   │   ├── promotion/           # Threshold evaluation, replay
│   │   ├── properties/          # Identity resolution, atomic upsert
│   │   ├── scoring/             # Tri-score engine, replay
│   │   ├── signals/             # Signal accumulation
│   │   └── workflow/            # Lead instance lifecycle
│   └── scripts/                 # CLI tools (CSV reimport)
├── tests/
│   ├── unit/                    # 6 test files, 89 tests
│   ├── integration/             # 6 test files (require Postgres)
│   └── helpers/test-db.ts
└── docs/                        # Schema, replay guide, migration history
```

## Scoring Model v1.0

- **Motivation Score**: Weighted sum of distress event contributions with exponential time decay
- **Deal Score**: Property economics (equity, ownership duration, absentee status, mortgage severity)
- **Composite Score**: `(motivation * motivation_weight + deal * deal_weight) * equity_multiplier`
- Weights, thresholds, multipliers, and suppression rules stored in `scoring_model_configs` table
- Promotion threshold: 40 (composite score)
- Tiers: A >= 80, B >= 60, C >= 40
