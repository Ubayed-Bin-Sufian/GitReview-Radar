# PR-Pulse AWS Architecture (Beginner Guide)

This document explains how **PR-Pulse** is deployed on AWS and how data moves through the system. It’s written for someone very new to AWS and serverless apps.

> Note: This repo uses **Supabase Postgres** for storage, and it serves a **public web dashboard** from AWS.

## Vertical Architecture Diagram

The diagram flows top-to-bottom from the user, to the frontend, to AWS networking, to backend compute, and finally to data/external services.

```mermaid
flowchart TB
  U[User] --> F[Frontend: S3 + CloudFront + React dashboard]
  F -->|Reads/writes via browser| S[(Supabase Postgres)]

  F -->|Calls protected API| APIGW[API Gateway (HTTP API)]
  APIGW --> SYNC[Lambda: Sync Handler (/sync)]
  SYNC --> GH[External: GitHub API]
  SYNC --> JEv[Jev SystemOne API (per-user key)]
  SYNC --> S

  EVT[EventBridge daily cron] --> DIGEST[Lambda: Digest Job]
  DIGEST --> S
  DIGEST --> CONN[Connector plugins - Slack, Discord, Telegram, Gmail]
```

## How users experience the system (high level)

1. A user opens the public dashboard (hosted on AWS).
2. The user signs in using **Supabase Auth**.
3. The user:
   - saves their **Jev API key** and **GitHub token** in the dashboard settings
   - adds repositories
   - clicks **Sync now** for a repository
4. On “Sync now”, the frontend calls AWS API Gateway → a Lambda function:
   - Lambda fetches open PRs and issues from GitHub
   - Lambda evaluates PR “actionability” with Jev
   - Lambda stores results in Supabase
5. Once per day, a scheduled AWS job reads stored evaluations from Supabase and (optionally) sends a digest through enabled connectors.

## Separate code from infrastructure

### Frontend / dashboard code (runs in the browser)
- `web/`
  - React app (sign-in, settings, repos, PR/issue tables)
  - Uses Supabase JavaScript client for database operations

### Backend code (runs on AWS)
- `src/handlers/`
  - `src/handlers/sync.ts`: handles `POST /sync`
  - `src/handlers/evaluate.ts`: handles `POST /evaluate` (single PR evaluation endpoint)
  - `src/handlers/digest.ts`: scheduled digest job (EventBridge)
- `src/jev/`: Jev request/response mapping
- `src/evaluator/`: state → “next-step owner” mapping
- `src/connectors/`: digest dispatch plugin registry

### AWS infrastructure code
- `infrastructure/`
  - `infrastructure/bin/app.ts`: CDK app entrypoint
  - `infrastructure/lib/pr-pulse-stack.ts`: defines AWS resources (Lambda/API Gateway/S3/CloudFront/EventBridge)

### External services used by the application
- Supabase (Auth + Postgres)
- GitHub (PRs and issues ingestion)
- TypeSafe Jev SystemOne (PR classification)
- Optional messaging destinations via connectors (e.g., Slack incoming webhook)

## AWS components (what they are and what they do)

### 1) Amazon S3 (static hosting for the dashboard)
**What it is:** S3 stores static website files (HTML/CSS/JS).

**Why this project uses it:** The dashboard is a React SPA build output in `web/dist`, so S3 is a simple place to host it.

**In this repo:** Defined in `infrastructure/lib/pr-pulse-stack.ts` as `DashboardBucket`.

**How it’s used:**
- On deployment, CDK uploads the contents of `web/dist` to the S3 bucket.
- The bucket website endpoint is used as the CloudFront origin.

**Important configuration in the repo:**
- `publicReadAccess: true`
- `websiteIndexDocument: 'index.html'`

### 2) CloudFront (HTTPS for the dashboard URL)
**What it is:** CloudFront is a global CDN that serves content over HTTPS with a friendly domain.

**Why this project uses it:** The repo can serve the app publicly, and CloudFront provides HTTPS.

**In this repo:** `DashboardDistribution` in `infrastructure/lib/pr-pulse-stack.ts`.

**How it’s used:**
- Users open the **CloudFront URL** output.
- CloudFront forwards requests to the S3 website endpoint.

### 3) API Gateway (HTTP API)
**What it is:** API Gateway exposes HTTP endpoints that invoke Lambda functions.

**Why this project uses it:** The dashboard needs a way to request backend work (sync/evaluation).

**In this repo:** `httpApi` in `infrastructure/lib/pr-pulse-stack.ts`.

**Routes defined:**
- `POST /evaluate` → `src/handlers/evaluate.ts`
- `POST /sync` → `src/handlers/sync.ts`

### 4) AWS Lambda (backend compute)
Lambda runs your application code on demand.

#### a) Sync Handler Lambda (`POST /sync`)
**File:** `src/handlers/sync.ts`

**What it does:**
- Validates the caller’s Supabase session:
  - It expects a `Bearer <supabase access token>` header
  - If no token or no Supabase config exists in the Lambda env vars, it returns `401`
- Reads:
  - the configured repository from Supabase (`repositories` table)
  - the user’s `github_token` and `jev_api_key` from Supabase (`user_settings`)
- Calls the internal sync logic in `src/sync/sync-repo.ts`:
  - fetches open PRs + issues from GitHub
  - evaluates PRs with Jev (using the user’s Jev key)
  - upserts PRs and issues into Supabase

**How it communicates with the next component:**
- GitHub API (external)
- Jev SystemOne API (external)
- Supabase Postgres (data storage + read/write)

#### b) Evaluate Lambda (`POST /evaluate`)
**File:** `src/handlers/evaluate.ts`

**What it does:**
- Validates PR metadata input (`validatePRMetadata`)
- Runs Jev evaluation and returns a structured state + score + next-step owner

> In this repo, `/sync` is the main path used by the dashboard.

#### c) Digest Lambda (scheduled job)
**File:** `src/handlers/digest.ts`

**What it does:**
- Runs every day using EventBridge cron
- Uses Supabase **service role** key (server/admin) to read:
  - enabled connectors (`connectors` table)
  - stored PR evaluations (`pull_requests` table)
- Builds a digest with `DigestBuilder`
- Dispatches digest via enabled connector plugins (e.g. Slack webhook)

### 5) EventBridge (daily schedule)
**What it is:** EventBridge can trigger events on a schedule.

**In this repo:** `DailyDigestRule` triggers the digest Lambda daily:
- `schedule: events.Schedule.cron({ minute: '0', hour: '9' })`

### 6) Supabase (Auth + Postgres storage)
**What it is:** Supabase provides:
- authentication
- a Postgres database

**In this repo:** Defined by the SQL migration at `supabase/migrations/20260926000000_pr_pulse.sql`.

**Important tables (as created by the migration):**
- `user_settings` (per-user Jev API key + GitHub token)
- `repositories` (repo config per user)
- `pull_requests` (synced PR metadata + Jev state/score/owner)
- `issues` (synced issue metadata; listed only)
- `connectors` (per-user enabled connector + JSON config)

**Security boundary (RLS + service role):**
- The browser uses the Supabase **anon/public client** key and relies on RLS policies.
- The backend digest job uses the Supabase **service role key** to bypass RLS for admin reads.

## External services (where they plug in)

### GitHub
- Used in `src/sync/sync-repo.ts` to fetch:
  - open PRs
  - PR reviews
  - PR statuses
  - open issues

### TypeSafe Jev SystemOne API
- Used in `src/jev/decision-engine.ts` to classify PRs.
- The backend sends SystemOne requests to the `JEV_ENDPOINT` environment variable.
- The Jev API key is stored per-user in Supabase (`user_settings.jev_api_key`).

### Connectors (optional delivery destinations)
- Used in `src/handlers/digest.ts` and `src/connectors/registry.ts`
- Connector delivery is driven by the `connectors` table (`enabled` toggle).

## Important security boundaries (based on actual code)

### Publicly accessible components
- **CloudFront/S3 dashboard** is public.

### Authentication happens here
- The dashboard uses Supabase Auth in the browser (`web/src/App.tsx` + `web/src/supabase.ts`).
- The `/sync` API is protected by expecting a **Supabase access token** in:
  - `Authorization: Bearer <token>`
- Without a valid bearer token, `src/handlers/sync.ts` returns `401`.

### Where secrets/API keys are stored
- Browser never receives secrets directly.
- Secrets are stored in Supabase:
  - Jev key: `user_settings.jev_api_key`
  - GitHub token: `user_settings.github_token`

Backend keys:
- Supabase service role key is stored in Lambda environment variables:
  - `SUPABASE_SERVICE_ROLE_KEY` (set by CDK from your deployment environment)

### Which components should not be called directly
- The Lambda endpoints are meant to be called through API Gateway and typically with the dashboard’s bearer token.
- Jev API is not called from the browser; it is called from Lambdas only.

## AWS Services Used

| AWS Service | Purpose in this project | What a beginner should know |
| ----------- | ------------------------- | --------------------------- |
| S3 | Hosts the built dashboard files | Stores static web assets |
| CloudFront | HTTPS delivery for the dashboard | CDN + HTTPS in front of S3 |
| API Gateway (HTTP API) | Exposes `/sync` and `/evaluate` routes | Turns HTTP requests into Lambda invocations |
| Lambda | Runs backend logic (sync, evaluate, scheduled digest) | Serverless compute for your code |
| EventBridge | Runs daily digest on a schedule | Cron-like scheduling |
| CloudWatch Logs | Lambda logging (implicit) | Where you debug failures |

## Request Flow (step-by-step)

### A) Opening the application (public dashboard)
1. **User** opens the CloudFront URL.
2. **CloudFront** serves static files.
3. **React frontend** loads in the browser.
4. Frontend initializes a Supabase client using:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (`web/src/supabase.ts`)
5. User signs in via Supabase Auth.
6. Frontend reads/writes data using Supabase + RLS.

### B) Calling a protected API: Sync PRs (`POST /sync`)
1. User clicks **Sync now** in the repo detail page (`web/src/App.tsx`).
2. Browser sends `POST /sync` to API Gateway with:
   - `Authorization: Bearer <supabase access token>`
3. API Gateway routes to Lambda `src/handlers/sync.ts`.
4. Lambda validates:
   - bearer token exists
   - Supabase config exists in Lambda env vars
5. Lambda reads from Supabase:
   - repo config (`repositories`)
   - user settings (`user_settings` → Jev key + GitHub token)
6. Lambda calls:
   - GitHub API (fetch PRs/issues)
   - Jev SystemOne API (classify PRs)
7. Lambda upserts results into Supabase tables (`pull_requests`, `issues`).
8. Lambda returns JSON success to the frontend.

### C) Scheduled digest (daily)
1. EventBridge triggers daily cron.
2. Lambda `src/handlers/digest.ts` runs.
3. Lambda reads enabled connectors and stored PR evaluations from Supabase.
4. Lambda builds markdown digest content via `DigestBuilder`.
5. Lambda dispatches digest via enabled connector plugins.

## Note

- If you add more connectors (e.g., Discord/Telegram/Gmail), you may need external credentials/config for each destination (the code supports it, but success depends on your supplied connector config).
