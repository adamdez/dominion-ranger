# BullMQ Queue — Run Steps

**Purpose:** Exact steps to run the server and queue-related scripts with lazy-initialized BullMQ.

---

## Lazy Initialization (Safe Startup)

- **Importing** `src/jobs/queues.ts` or `src/jobs/worker.ts` does **not** connect to Redis or schedule repeatable jobs.
- **Queues** are created lazily only when `getIngestionQueue()`, `getScoringQueue()`, or `getSentinelQueue()` is called.
- **Workers** start only when `AUTO_PIPELINE_ENABLED=true` **and** `startWorkers()` is explicitly called from `src/index.ts`.
- **Repeatable jobs** are scheduled only when **both** `AUTO_PIPELINE_ENABLED=true` **and** `INGESTION_SCHEDULER_ENABLED=true`.

---

## Run Steps

### 1. Server with pipeline disabled (no Redis)

```bash
# .env: AUTO_PIPELINE_ENABLED=false (or omit)
npm run dev
# or
npm run build && npm start
```

- Server starts without connecting to Redis.
- API handles requests; ingestion queue endpoints return 503 when pipeline is disabled.
- Logs: `Pipeline mode` with `AUTO_PIPELINE_ENABLED`, `INGESTION_SCHEDULER_ENABLED`, `workers`, `scheduler`; `Auto-pipeline DISABLED — server will only handle API requests (no Redis/queue connection)`.

### 2. Seed scoring config (required for scoring jobs)

```bash
npm run db:seed:scoring
```

- Inserts a minimal `scoring_model_configs` row with `active=true` if none exists.
- Idempotent: safe to run multiple times.
- Logs: `inserted: seed-config-v1` or `already present: <version>`.

### 3. Server with pipeline enabled (Redis + workers)

```bash
# .env: AUTO_PIPELINE_ENABLED=true
# .env: REDIS_URL=redis://...
# .env: INGESTION_SCHEDULER_ENABLED=false  # default — workers only, no repeatables
# .env: INGESTION_SCHEDULER_ENABLED=true   # optional — add repeatable ingestion jobs
npm run dev
# or
npm run build && npm start
```

- **Workers** start when `AUTO_PIPELINE_ENABLED=true` (ingestion, scoring, sentinel). Manual/API-triggered jobs work.
- **Repeatable jobs** (scheduleIngestionJobs + cron scheduler) run only when **both** flags are true.
- Logs at startup show both flags and what is enabled: `workers`, `scheduler`.

### 4. Print queue state (inspect Redis)

```bash
npm run queue:state
# or
npx tsx src/scripts/print-queue-state.ts
```

- Connects directly to Redis (independent of `AUTO_PIPELINE_ENABLED`).
- Prints: queue names, job counts (waiting, active, completed, failed, delayed), repeatable jobs list.

### 5. Clean stale Redis jobs

```bash
npm run clean:redis-jobs
```

- Removes repeatable/scheduled jobs and drains queues.
- Use after deploying lazy-init or when Redis has stale jobs from previous runs.

---

## Queue Names (do not change)

| Queue   | Name             |
|---------|------------------|
| Ingestion | `ranger-ingestion` |
| Scoring   | `ranger-scoring`   |
| Sentinel  | `ranger-sentinel`  |

---

## Environment Variables

| Variable                   | Required when pipeline enabled | Default |
|----------------------------|-------------------------------|---------|
| `AUTO_PIPELINE_ENABLED`    | —                             | `false` |
| `INGESTION_SCHEDULER_ENABLED` | — (requires AUTO_PIPELINE_ENABLED) | `false` |
| `REDIS_URL`                | Yes                           | —       |
