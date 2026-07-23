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
