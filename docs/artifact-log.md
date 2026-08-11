# Artifact Log — Clinic Appointment Booking System

| ID | Filename | Phase | Description |
|----|----------|-------|-------------|

## Phase 4: Database Migration Automation (Flyway)

| Artifact ID | Description | File Path | Notes |
|---|---|---|---|
| P4-DB-01-flyway-v1-pgcrypto | Migration: create pgcrypto extension | `db/migrations/V1__create_pgcrypto_extension.sql` | First Flyway migration; enables password hashing used by admins table |
| P4-DB-02-flyway-v2-patients | Migration: create patients table | `db/migrations/V2__create_patients_table.sql` | Direct conversion from original `01-init.sql` |
| P4-DB-03-flyway-v3-doctors | Migration: create doctors table | `db/migrations/V3__create_doctors_table.sql` | Direct conversion from original `01-init.sql` |
| P4-DB-04-flyway-v4-appointments | Migration: create appointments table | `db/migrations/V4__create_appointments_table.sql` | Includes FK constraints to patients and doctors |
| P4-DB-05-flyway-v5-admins | Migration: create admins table | `db/migrations/V5__create_admins_table.sql` | Table only; seed data moved to `01-init.sql` |
| P4-DB-06-flyway-v6-appointments-notes | Migration: add notes column to appointments | `db/migrations/V6__add_notes_to_appointments.sql` | Demonstrates incremental migration on existing schema; foreshadows Notification Service |
| P4-DB-07-init-sql-seed-only | Reduced init script — seed data only | `db/init/01-init.sql` | Narrowed from full schema creation to admin account seed; runs after Flyway via `db-seed` service |
| P4-DOCKER-01-flyway-service | Flyway service definition | `docker-compose.yml` | Runs migrations against `db`, depends on `service_healthy` |
| P4-DOCKER-02-db-seed-service | db-seed service definition | `docker-compose.yml` | Runs `01-init.sql` via `psql`, depends on Flyway's `service_completed_successfully` |
| P4-DOCKER-03-db-healthcheck | Postgres healthcheck config | `docker-compose.yml` | `pg_isready` check; required for `service_healthy` condition to function |

## Phase 5: CI/CD Pipeline (GitHub Actions)

| Artifact ID | Description | File Path | Notes |
|---|---|---|---|
| P5-CI-01-github-actions-workflow | CI workflow definition | `.github/workflows/ci.yml` | Triggers on push/PR to main; builds full docker compose stack and runs smoke tests |
| P5-CI-02-readiness-check | App readiness polling step | `.github/workflows/ci.yml` | Polls `http://localhost:3000/` with timeout instead of fixed sleep, accounting for variable CI runner speed |
| P5-CI-03-failure-log-dump | Conditional failure logging step | `.github/workflows/ci.yml` | Dumps `docker compose logs` only on failure for debugging directly from GitHub Actions UI |
| P5-CI-04-teardown-always | Guaranteed teardown step | `.github/workflows/ci.yml` | `docker compose down -v` runs via `if: always()` to prevent orphaned containers on failed runs |
| P5-APP-01-jest-smoke-tests | Smoke test suite | `tests/smoke.test.js` | Verifies landing page (200), login page (200), and auth-protected route redirect (302) against a live running stack |
| P5-APP-02-jest-test-script | Test runner configuration | `package.json` | Replaced placeholder `test` script with `jest`; added `jest` as devDependency |
| P5-DIAG-01-first-ci-run | First successful CI run | GitHub Actions run #1 | Passed on first attempt, 57s duration — full stack validated in a clean environment |

## Phase 6: Kubernetes Orchestration (minikube)

| Artifact ID | Description | File Path | Notes |
|---|---|---|---|
| P6-K8S-01-configmap | Non-sensitive app configuration | `k8s/configmap.yaml` | DB host, port, name, user — separated from secrets per K8s convention |
| P6-K8S-02-secret | Sensitive credentials | `k8s/secret.yaml` | DB password and session secret; uses `stringData` for plain-text authoring |
| P6-K8S-03-db-pvc | Database persistent storage | `k8s/db-pvc.yaml` | Replaces Compose's `pgdata` named volume; survives pod rescheduling |
| P6-K8S-04-db-deployment | PostgreSQL deployment | `k8s/db-deployment.yaml` | Includes readinessProbe (`pg_isready`), equivalent to Compose healthcheck |
| P6-K8S-05-db-service | Internal DB service | `k8s/db-service.yaml` | Provides stable DNS name `clinic-db` for other pods |
| P6-K8S-06-migrations-configmap | Flyway migration files as ConfigMap | `k8s/migrations-configmap.yaml` | Generated via `kubectl create configmap --from-file` from `db/migrations/` |
| P6-K8S-07-seed-configmap | Seed script as ConfigMap | `k8s/seed-configmap.yaml` | Generated via `kubectl create configmap --from-file` from `db/init/01-init.sql` |
| P6-K8S-08-flyway-job | Flyway migration Job | `k8s/flyway-job.yaml` | One-shot Job; K8s equivalent of Compose's one-shot flyway service |
| P6-K8S-09-db-seed-job | Seed data Job | `k8s/db-seed-job.yaml` | Init Container polls for `admins` table existence before seeding — self-verifying dependency, replaces `depends_on: service_completed_successfully` |
| P6-K8S-10-app-deployment | Application deployment | `k8s/app-deployment.yaml` | Init Container polls for seed row before app starts; `imagePullPolicy: Never` uses locally loaded image |
| P6-K8S-11-app-service | App NodePort service | `k8s/app-service.yaml` | Exposes app outside the cluster via `minikube service` tunnel |
| P6-BUG-01-missing-configmap-apply | Debugging: Flyway stuck in ContainerCreating | N/A (process issue) | ConfigMaps generated with `--dry-run=client` were saved to file but never applied to the cluster; diagnosed via `kubectl describe pod` Events section |
| P6-BUG-02-nested-command-substitution | Debugging: app Init Container auth failure | `k8s/app-deployment.yaml` | Nested `$(...)` inside `$(...)` broke Kubernetes' variable substitution for DB_USER/DB_PASSWORD in the wait-loop; fixed by restructuring the query to avoid outer command substitution; diagnosed via `kubectl logs -c wait-for-seed` |
| P6-DIAG-01-k8s-smoke-test-pass | Smoke tests re-run against K8s deployment | N/A (verification step) | Same Jest suite from Phase 5 passed 3/3 against the app running in Kubernetes, confirming behavioral parity with the Compose deployment |

## Phase 7: Monitoring (Prometheus & Grafana)

| Artifact ID | Description | File Path | Notes |
|---|---|---|---|
| P7-MON-01-prometheus-stack | Prometheus deployment with RBAC and three scrape jobs | `k8s/monitoring/prometheus-configmap.yaml`, `prometheus-deployment.yaml`, `prometheus-rbac.yaml`, `prometheus-service.yaml` | Scrape jobs: kube-state-metrics static target, annotation-filtered pod discovery, cAdvisor via K8s API proxy — all confirmed UP in Prometheus targets page |
| P7-MON-02-kube-state-metrics | kube-state-metrics v2.10.1 deployment | `k8s/monitoring/kube-state-metrics-deployment.yaml`, `kube-state-metrics-rbac.yaml`, `kube-state-metrics-service.yaml` | ClusterIP only, internal scrape target; exposes pod/deployment state as Prometheus metrics |
| P7-MON-03-grafana-deployment | Grafana deployment and service | `k8s/monitoring/grafana-deployment.yaml`, `grafana-service.yaml` | Admin credentials via Deployment env vars; no PVC by design — state is ephemeral and resets to defaults on pod restart |
| P7-MON-04-grafana-datasource | Provisioned Prometheus datasource | `k8s/monitoring/grafana-datasource-configmap.yaml` | Auto-configured on pod start via ConfigMap mount; no manual UI setup required |
| P7-MON-05-grafana-dashboard-provider | Dashboard provider configuration | `k8s/monitoring/grafana-dashboard-provider-configmap.yaml` | Enables Grafana to auto-load dashboards from mounted ConfigMaps on startup |
| P7-MON-06-clinic-dashboard | "Clinic App Infrastructure" dashboard definition | `k8s/monitoring/dashboard.json`, `grafana-dashboards-configmap.yaml` | Four panels: Pod Status, CPU Usage per Pod, Memory Usage per Pod, Pod Restart Counts — all verified showing live data |
| P7-BUG-01-cadvisor-container-label | Debugging: CPU/Memory panels showing no data | `k8s/monitoring/dashboard.json` | On this minikube/WSL2/Docker-driver setup, `container_cpu_usage_seconds_total` and `container_memory_usage_bytes` carry no `container` label; PromQL filters on `container!=""` silently returned zero results. Fixed by removing the filter from both panel queries; verified via Grafana UI after `grafana-dashboards-configmap.yaml` regeneration and `kubectl rollout restart` |

## Phase 8: Notification Service (Strangler Fig Extraction)

| Artifact ID | Description | File Path | Notes |
|---|---|---|---|
| P8-APP-01-notification-service | Standalone Notification Service (Express + Nodemailer) | `notification-service/index.js`, `mailer.js`, `package.json` | Two endpoints: `/notify/confirmation`, `/notify/reminder`; `/health` for probes/CI; no database access — receives all data via request body, matching Strangler Fig principle of a decoupled extracted service |
| P8-APP-02-monolith-notification-wiring | Monolith wiring: confirmation trigger + reminder scheduling | `routes/appointments.js`, `index.js`, `jobs/reminder-check.js` | Monolith retains scheduling logic ("when"); new service owns formatting/sending ("how"). Confirmation call is fire-and-forget (booking succeeds even if email fails). Reminder job uses `node-cron` (hourly), verified end-to-end with no duplicate-send risk via `reminder_sent` flag |
| P8-DB-01-reminder-sent-column | V7 migration adding reminder tracking | `db/migrations/V7__add_reminder_sent_to_appointments.sql` | `reminder_sent BOOLEAN DEFAULT FALSE` on `appointments`; prevents duplicate reminder emails across cron runs |
| P8-DOCKER-01-notification-service-container | Containerization of the Notification Service | `notification-service/Dockerfile`, `.dockerignore`, `docker-compose.yml` | Added as a new service in Compose; SMTP credentials passed via `${SMTP_USER}`/`${SMTP_PASS}` substitution, auto-read from project-root `.env` (gitignored) |
| P8-K8S-01-notification-service-k8s | Kubernetes manifests for the Notification Service | `k8s/notification-service-deployment.yaml`, `notification-service-service.yaml`, `notification-secret.template.yaml` | ClusterIP-only (internal access only); readiness probe on `/health`; Secret template documents shape only — real credentials created imperatively via `kubectl create secret generic`, never committed to git (see notes below) |
| P8-K8S-02-app-deployment-notification-url | Wired monolith to Notification Service in K8s | `k8s/app-deployment.yaml` | Added `NOTIFICATION_SERVICE_URL` env var pointing to `clinic-notification-service` ClusterIP Service DNS name |
| P8-CI-01-notification-ci | Extended CI to cover the Notification Service | `.github/workflows/ci.yml`, `tests/notification.smoke.test.js` | New readiness check for the service + 3 smoke tests (`/health`, validation on both notify endpoints); real email sending isn't tested in CI since GitHub Actions has no safe way to hold the Gmail App Password without additional Secrets setup — a deliberate scope decision |
| P8-DOC-01-secret-handling-decision | Security decision: real credential handling vs. established pattern | N/A (documented in `k8s/notification-secret.template.yaml` comments) | Unlike `clinic-secret` (disposable dev DB password, committed in plaintext per Phase 6 pattern), the Gmail App Password is a real personal credential and is never committed — created imperatively from local `.env` instead |

## AI Agent Extension (Weeks 1–3, beyond the eight core phases)

| Artifact ID | Description | File Path | Notes |
|---|---|---|---|
| AGENT-W1-01-tool-calling-loop | Provider-agnostic LLM tool-calling loop replacing the Week 0 regex `/provision` parser | `agent-provisioner/src/agent.js`, `src/tools.js`, `src/providers/gemini.js`, `src/providers/anthropic.js` | Dispatches via `LLM_PROVIDER` env var (default `gemini`); `apply_manifest` independently re-validates every request against `policy.json` regardless of the agent's own reasoning — defense in depth preserved from Week 0 |
| AGENT-W1-02-test-suite | Offline test suite, no live credentials required | `agent-provisioner/test/agent.test.js` | 23/23 passing at end of Week 1; scripted fake LLM clients |
| AGENT-W2-01-trigger-build | Bounded-registry GitHub Actions build trigger | `agent-provisioner/src/triggerBuild.js`, `src/buildRegistry.json` | Only pre-registered services (`clinic-app`) can be rebuilt; live-verified end-to-end via Telegram, confirmed as a manually-triggered run in the Actions tab |
| AGENT-W2-02-ci-workflow-dispatch | Added `workflow_dispatch` trigger to existing CI workflow | `.github/workflows/ci.yml` (commit `58fd79b`) | Required for `trigger_build` to call the workflow at all; workflow previously fired on `push` only |
| AGENT-W2-BUG-01-fine-grained-pat-403 | Debugging: persistent 403 on `workflow_dispatch` with a fine-grained PAT | N/A (documented in report Ch5/Ch6) | Fine-grained PAT with `Actions: write` + `Contents: write` failed specifically on the dispatch call while read-level Actions access worked; isolated via direct `curl` testing. Resolved by switching to a classic PAT (`repo` + `workflow` scopes) |
| AGENT-W3-01-session-store | Durable per-chat conversation memory | `agent-provisioner/src/sessionStore.js` | Persists full transcripts to `data/sessions/<chatId>.json`; durability verified via genuine disk reload after process restart |
| AGENT-W3-02-why-command | Human-readable reasoning trace on demand | `agent-provisioner/src/formatTrace.js`, `src/agentBot.js` (`/why`, `/reset`) | Formats trace for readability rather than raw JSON; provider-switch mid-conversation detected and handled by starting a fresh history rather than crashing |
| AGENT-W3-BUG-01-why-duplication | Debugging: `/why` showed the final answer twice | `agent-provisioner/src/providers/gemini.js`, `src/providers/anthropic.js` | Final-answer turns were incorrectly logged as reasoning-trace entries; caught via live use, not the test suite. Fixed by restricting reasoning-trace logging to turns that also make a tool call |
| AGENT-W3-BUG-02-test-hermeticity | Debugging: `npm test` applied a real deployment to the live cluster | `agent-provisioner/test/agent.test.js` | Root cause: stale `APPLY_MODE=live` env var + module-load-time capture of `execFile` in `checkClusterUsage.js`/`k8sApply.js`. Fixed by globally stubbing `child_process.execFile` before any other `require()`; fix independently verified by re-running the dangerous scenario (`APPLY_MODE=live npm test`) and confirming zero mutating calls |
| AGENT-W3-03-test-suite | Full offline test suite at end of Week 3 | `agent-provisioner/test/agent.test.js` | 46/46 passing, `npm test`; includes offline `trigger_build` tests, one live-wiring test against `api.github.com` with a deliberately invalid token, session-store durability tests, `/why` duplication regression test, and a conversation-memory cross-turn test |
| AGENT-W4-BUG-01-markdown-parse-fallback | Debugging: Telegram Markdown parse failure silently dropped the real agent reply | `agent-provisioner/src/agentBot.js` | `parse_mode: "Markdown"` sends had no fallback; unbalanced `_`/`*`/backtick characters in model-generated text (e.g. tool/field names like `generate_content_free_tier_requests`) caused Telegram's entity parser to throw a 400, replacing the real answer with a bare parse-error message to the user. Found live via a Gemini 429 quota-exhaustion test that also surfaced a stray duplicate bot process (409 Conflict on getUpdates). Fixed with a `safeSend()` wrapper that retries once as plain text on a Markdown-parse failure rather than losing the message; verified via `node -c` and full 46/46 regression pass (agentBot.js itself has no direct unit coverage, so live re-testing is the confirmation step) |
| BUG-01-home-route-db-localhost | Debugging: `GET /` returned 500 for every request during OOM-limit load testing | `routes/home.js` | Found incidentally while load-testing `clinic-app` under an intentionally low memory limit (32Mi) to reproduce a real OOM crash for report evidence. `kubectl top` showed the pod using only ~20Mi — well under the limit — so memory pressure was ruled out; `kubectl logs` instead showed an `AggregateError [ECONNREFUSED]` from `pg-pool`, attempting to reach Postgres at `localhost:5432` / `::1:5432` from within `home.js`, rather than the cluster's `clinic-db` Service DNS name used correctly elsewhere in the app. Root cause not yet fixed — flagged here as a genuine, independently-discovered defect distinct from the agent extension work, worth a line in Ch6 alongside the "verify, don't assume" theme (the failure was masked until this specific route was exercised under load) |
| BUG-02-jest-scope-leak | Debugging: main-app CI (`build-and-test`) failed with `Your test suite must contain at least one test` on a commit that only touched `docs/artifact-log.md` | `package.json` (root) | Root cause: `"test": "jest"` had no scoping config, so Jest's default glob (`**/*.test.js`) picked up `agent-provisioner/test/agent.test.js` — a separate, self-contained subproject with its own custom test runner (plain assertions/console output, not Jest's `it()`/`test()` API) and its own independent `npm test`. Jest found zero registered tests inside that file and failed the whole CI run. This surfaced only once `agent-provisioner/` was added to the repo (Week 4) — the two test suites had never coexisted before. Fixed by adding `testPathIgnorePatterns` (`/node_modules/`, `/agent-provisioner/`) to the root `package.json`'s `jest` config; verified via `npx jest --listTests`, confirming only the two real smoke-test files are discovered post-fix, not by assuming the config was correct |
