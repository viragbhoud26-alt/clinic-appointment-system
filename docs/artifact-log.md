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
