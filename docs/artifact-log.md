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
