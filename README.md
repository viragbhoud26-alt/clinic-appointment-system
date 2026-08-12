# Clinic Appointment Booking System

A DevOps capstone project: legacy application modernization, demonstrated
by rebuilding an appointment booking system through eight incremental
phases, then extending it with a ChatOps/AI-agent provisioning layer.

**Stack:** Node.js / Express / PostgreSQL, Docker & Docker Compose,
Kubernetes (minikube), GitHub Actions CI/CD, Prometheus & Grafana,
Flyway migrations.

## What's in this repo

- **`db/`, `jobs/`, `k8s/`, `middleware/`, `notification-service/`,
  `public/css/`, `routes/`, `tests/`, `views/`** — the clinic application
  itself, built up phase by phase (see `docs/artifact-log.md` for the
  full build history).
- **`agent-provisioner/`** — a self-contained extension built after the
  eight core phases: an AI agent (Gemini/Anthropic tool-calling) that
  replaces an earlier fixed-syntax Telegram bot for self-service resource
  provisioning, with its own README, tests, and independent policy
  validation. See
  [`agent-provisioner/README.md`](./agent-provisioner/README.md) for
  details, setup, and required environment variables.
- **`docs/artifact-log.md`** — a running log of every phase's artifacts,
  defects found, and fixes applied, following a `P<phase>-<category>-<seq>`
  naming convention (plus an `AGENT-*` / `BUG-*` convention for the agent
  extension and its integration effects).
- **`.github/workflows/ci.yml`** — CI pipeline: builds and smoke-tests the
  main application on every push to `main`, and supports a manual
  `workflow_dispatch` trigger (also callable by the agent extension's
  `trigger_build` tool).

## Running locally

```bash
npm install
npm test          # main app's Jest smoke tests
docker compose up # or: see k8s/ for the Kubernetes deployment path
```

For the agent extension, see its own README for setup — it has separate
dependencies and environment variables from the main application.

## Project context

This repository accompanies a postgraduate major project report
(*Legacy Application Modernization: A DevOps-Driven Redevelopment of a
Clinic Appointment Booking System*), developed using a Design Science
Research methodology with a "verify, don't assume" diagnostic discipline
applied throughout — every phase, including the agent extension, is
backed by evidence of defects found and fixed through direct inspection
of running state, not just passing tests.
