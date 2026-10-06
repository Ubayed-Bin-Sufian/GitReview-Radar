# PR-Pulse (GitReview Radar)

PR-Pulse is an open-source tool that **syncs open PRs from GitHub**, evaluates them with **TypeSafe Jev (SystemOne)** into actionable states, and shows a **prioritized review queue** in a public web dashboard on AWS.

Optionally, it can send a **daily digest** through user-enabled connectors (e.g. Slack webhook).

## Architecture

```mermaid
flowchart LR
  Browser[User Browser] -->|Sign in / Settings / Sync UI| Dashboard[S3 Public Dashboard + React]
  Browser -->|Sync now| API[API Gateway: POST /sync]

  API --> SyncLambda[Lambda: Sync Handler]
  SyncLambda -->|GitHub API| GitHub[GitHub]
  SyncLambda -->|Upsert PRs/issues| Supabase[(Supabase Postgres)]

  Browser -->|Dashboard load| Dashboard
  Dashboard -->|Read repos/PRs/issues| Supabase

  subgraph Evaluation
    SyncLambda -->|Jev evaluate PRs using user Jev key| Jev[Jev SystemOne API]
  end

  Cron[EventBridge Cron daily] --> DigestLambda[Lambda: Digest Job]
  DigestLambda -->|Read evaluations + enabled connectors| Supabase
  DigestLambda -->|Dispatch digest| Connectors[Connector Plugins - Slack, Telegram, etc.]
end
```





## What’s in this repo

- `src/jev/`: Jev integration + state scoring (`NEEDS_AUTHOR_FIX`, `STALE_BRANCH`, `READY_FOR_FINAL_MERGE`, `CI_BLOCKED`)
- `src/evaluator/`: owner assignment (Next-Step Owner)
- `src/handlers/`: AWS Lambda handlers (`/sync`, `/evaluate`, scheduled digest)
- `src/connectors/`: connector plugin registry + dispatch (daily digest delivery)
- `web/`: React dashboard
- `infrastructure/`: AWS CDK stack (Lambda + API Gateway + CloudFront + S3)



## Prerequisites

- Node.js 24+
- An AWS account with permissions to deploy CDK stacks
- A Supabase project
- A TypeSafe Jev API key



## Local development / tests

```bash
npm test
```



## Supabase setup

1. Create a Supabase project
2. In Supabase:
  - Enable **Data API**
  - Apply RLS policies (handled by the migration)
3. Run the migration:
  - `supabase/migrations/20260926000000_pr_pulse.sql`

You will need these values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (public anon key)
- `SUPABASE_SERVICE_ROLE_KEY` (server/admin key for the backend job)



## Deploy to AWS (dashboard + API)



### 1) Bootstrap CDK (first time per account/region)

```bash
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/YOUR_AWS_REGION
```



### 2) Build the dashboard

You must build after you know the API Gateway URL.

```bash
cp web/.env.example web/.env
```

Edit `web/.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` (leave blank initially)

Then:

```bash
npm run build --prefix web
```



### 3) Set AWS + Supabase environment variables for CDK

In the same shell where you deploy, export:

```bash
export SUPABASE_URL="..."
export SUPABASE_ANON_KEY="..."
export SUPABASE_SERVICE_ROLE_KEY="..."

# Optional but recommended:
export JEV_ENDPOINT="https://api.typesafe.ai/v1/systemone"
```



### 4) Deploy the stack

```bash
npx cdk deploy --app "npx ts-node --prefer-ts-exts infrastructure/bin/app.ts"
```

Copy outputs:

- `DashboardCloudFrontUrl` (public HTTPS dashboard)
- `ApiEndpointUrl` (use as `VITE_API_URL`)



### 5) Rebuild dashboard with the real API URL

Update `web/.env`:

```bash
VITE_API_URL="PASTE_HTTPS_API_ENDPOINT_FROM_OUTPUT"
```

Then rebuild + redeploy:

```bash
npm run build --prefix web
npx cdk deploy --app "npx ts-node --prefer-ts-exts infrastructure/bin/app.ts"
```



## Jev configuration

- Users save their own Jev key in the dashboard settings.
- During PR `Sync now`, PRs are evaluated using that user Jev key.

The backend uses:

- `JEV_ENDPOINT` (default: `https://api.typesafe.ai/v1/systemone`)



## Credentials / secrets

- Supabase **service role** is only used in AWS Lambdas (never in the browser).
- GitHub access token is saved per-user in Supabase.
- Jev API key is saved per-user in Supabase.

