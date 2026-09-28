# PR-Pulse (GitReview Radar) MVP - Implementation Tasks

## Overview

This document outlines the implementation tasks for the PR-Pulse (GitReview Radar) MVP, a serverless PR evaluation system that uses TypeSafe AI's Jev decision engine to analyze pull request metadata and generate daily prioritization digests.

The project follows a 6-phase approach:
- Phase 1: Foundation & Jev Client Setup
- Phase 2: Core Evaluator Logic
- Phase 3: Infrastructure as Code
- Phase 4: Daily Digest Builder
- Phase 5: Testing & Validation
- Phase 6: Documentation & Deployment

---

# Implementation Plan:

This section outlines the required and recommended sections for this tasks document:

- **Overview**: Introduction and project context (recommended)
- **Tasks**: Detailed task list with phases, estimated time, and completion status
- **Task Dependency Graph**: JSON wave definitions for task ordering (required)
- **Notes**: Additional context, skipped phases, or important considerations (recommended)
- **Task Summary**: High-level overview with table of phases and time estimates

---

## Tasks

- [x] 1.1 Initialize Project Structure: Create repository structure with `src/`, `tests/`, `infrastructure/` directories, initialize Node.js project with `package.json`, install dependencies: `aws-sdk`, `jest`, `fast-check`, configure TypeScript (`tsconfig.json`), set up Git hooks for pre-commit linting
- [x] 1.2 Set Up Jev Client: Create `src/jev/` directory for decision engine, implement `src/jev/decision-engine.ts` - Jev client wrapper, implement `src/jev/rules/` directory with individual rule files (ci-blocked.rule.ts, needs-author-fix.rule.ts, stale-branch.rule.ts, ready-for-merge.rule.ts), implement rule priority ordering, write unit tests for Jev client
- [x] 1.3 Configure Environment Wiring: create `src/config/` and Lambda env wiring for Supabase (URL + anon key + service role key) and Jev configuration
- [x] 1.4 Implement GitHub Sync Handler: Create `src/handlers/sync.ts` to fetch open PRs/issues from GitHub, upsert into Supabase with Jev classification, implement head_sha for deduplication
- [x] 2.1 Implement PR Metadata Types: Define TypeScript interfaces for PR input, define TypeScript interfaces for evaluation output, create enum for states: `PRState` (`NEEDS_AUTHOR_FIX`, `READY_FOR_FINAL_MERGE`, `STALE_BRANCH`, `CI_BLOCKED`)
- [x] 2.2 Implement Evaluator Function: Create `src/evaluator/evaluate.ts` main evaluation function, implement score calculation logic per rule, implement score capping at 100, add validation for input fields (non-null, valid enum values)
- [x] 2.3 Write Jest Unit Tests for Evaluator and Jev rules: cover rule priority, score bounds/capping, owner assignment, and error handling paths
- [x] 2.4 Write Jest Scenario Tests (S-1..S-5): validate representative inputs for CI failure, changes requested, stale branches, and ready-for-merge outcomes
- [x] 3.1 Set Up AWS CDK: Add CDK app/stack for Node.js 24 Lambdas, API Gateway routes (`/evaluate`, `/sync`), EventBridge cron, and S3 dashboard hosting
- [x] 3.2 Define Lambda Function Infrastructure: Deploy evaluator, sync, and digest Lambda functions (Node.js 24) with least-privilege IAM and appropriate memory/timeout
- [x] 3.3 Define API Gateway Infrastructure: Configure HTTP API routes `POST /evaluate` and `POST /sync` integrated to their Lambdas (CORS enabled)
- [x] 3.4 Define EventBridge Infrastructure: Configure a cron schedule that triggers the daily digest Lambda
- [x] 3.5 Configure Supabase Data Layer: Use Supabase SQL migrations + RLS (instead of DynamoDB) for `user_settings`, `repositories`, `pull_requests`, `issues`, and `connectors`
- [x] 4.1 Implement Digest Builder and Dispatch Input: Use `src/digest/digest-builder.ts` to format daily digests from stored PR evaluations
- [x] 4.2 Implement Connector-Based Notification Delivery: Add `src/connectors/` plugin registry with all 4 connectors (slack.ts, discord.ts, telegram.ts, gmail.ts), implement dispatch logic in the daily digest Lambda
- [x] 4.3 Implement Report Format: Generate Markdown and JSON digest outputs from `DigestBuilder` (used by Slack/Discord/Telegram/Gmail plugins)
- [ ] 5.1 Integration Testing: Deploy to staging environment, test API Gateway (`/sync`) → Lambda end-to-end, test EventBridge → daily digest execution, verify Supabase upserts/selects and connector delivery
- [ ] 5.2 Performance Testing: Load test with 100 evaluations/minute, verify p99 latency < 500ms, test concurrent evaluation scenarios
- [ ] 5.3 Security Review: Audit Lambda IAM permissions (least privilege), review environment variables for secrets, validate API Gateway authentication, enable CloudWatch log encryption, configure CloudWatch alarms for Lambda errors >1% and API Gateway 5xx errors >1%
- [ ] 5.4 Property-Based Testing: Create property test file, implement P-1 through P-8 correctness properties using fast-check library, run 100+ iterations per property, verify test coverage and integration with existing unit tests
- [ ] 6.1 Write API Documentation: Document `/evaluate` endpoint with OpenAPI spec, include request/response examples, document error codes and scenarios
- [ ] 6.2 Write Operational Runbooks: Debugging evaluation failures, handling CI timeout scenarios, scaling the service during high load
- [ ] 6.3 Production Deployment: Deploy to production, configure CloudWatch alarms for p99 latency >500ms and throughput issues, and verify end-to-end sync + digest dispatch with enabled connectors

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": "wave-1",
      "tasks": ["1.1"],
      "description": "Foundation setup - project initialization"
    },
    {
      "id": "wave-2",
      "tasks": ["1.2"],
      "dependencies": ["wave-1"],
      "description": "Jev client implementation"
    },
    {
      "id": "wave-3",
      "tasks": ["1.3", "1.4"],
      "dependencies": ["wave-2"],
      "description": "Environment wiring and GitHub sync handler"
    },
    {
      "id": "wave-4",
      "tasks": ["2.1"],
      "dependencies": ["wave-1"],
      "description": "Type definitions for PR metadata"
    },
    {
      "id": "wave-5",
      "tasks": ["2.2"],
      "dependencies": ["wave-4"],
      "description": "Evaluator function implementation"
    },
    {
      "id": "wave-6",
      "tasks": ["2.3", "2.4"],
      "dependencies": ["wave-5"],
      "description": "Test implementation (Jest unit + scenario cases)"
    },
    {
      "id": "wave-7",
      "tasks": ["3.1"],
      "dependencies": ["wave-3"],
      "description": "AWS CDK setup"
    },
    {
      "id": "wave-8",
      "tasks": ["3.2", "3.3", "3.4", "3.5"],
      "dependencies": ["wave-7"],
      "description": "Infrastructure definition (Lambda, API Gateway, EventBridge, S3, Supabase)"
    },
    {
      "id": "wave-9",
      "tasks": ["4.1", "4.2", "4.3"],
      "dependencies": ["wave-8"],
      "description": "Daily digest builder"
    },
    {
      "id": "wave-10",
      "tasks": ["5.1"],
      "dependencies": ["wave-8"],
      "description": "Integration testing"
    },
    {
      "id": "wave-11",
      "tasks": ["5.2", "5.3"],
      "dependencies": ["wave-10"],
      "description": "Performance and security testing"
    },
    {
      "id": "wave-12a",
      "tasks": ["5.4"],
      "dependencies": ["wave-6"],
      "description": "Property-based testing implementation"
    },
    {
      "id": "wave-13",
      "tasks": ["6.1", "6.2"],
      "dependencies": ["wave-8"],
      "description": "Documentation and runbooks"
    },
    {
      "id": "wave-14",
      "tasks": ["6.3"],
      "dependencies": ["wave-10", "wave-11", "wave-12a", "wave-13"],
      "description": "Production deployment"
    }
  ]
}
```

## Task Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1. Foundation & Jev Client Setup | 4 | 10 hours |
| 2. Core Evaluator Logic | 4 | 13 hours |
| 3. Infrastructure as Code | 5 | 11 hours |
| 4. Daily Digest Builder | 3 | 7 hours |
| 5. Testing & Validation | 4 | 8 hours |
| 6. Documentation & Deployment | 3 | 6 hours |
| **Total** | **23** | **55 hours** |

---

## Success Criteria

- [x] Jest unit tests pass (run via `npm test`)
- [ ] Manual smoke test: sync PRs/issues -> stored evaluations -> daily digest dispatch via an enabled connector
- [ ] API latency p99 < 500ms (benchmarked on AWS after deployment)
- [ ] System handles 100+ evaluations/minute (load-tested after deployment)
- [ ] Production deployment successful with no errors
- [ ] Documentation complete and reviewed

## Notes

- **Phase 1.4** added to explicitly cover the GitHub sync handler implementation

- **Phase 2.3** updated to explicitly include error handling test cases

- **Phase 4.2** updated to explicitly specify all 4 connector plugins (slack, discord, telegram, gmail)

- **Phase 5.3** updated to explicitly include CloudWatch alarms configuration

- **Phase 6.3** updated to include latency and throughput monitoring alarms

- All connector plugin implementations (slack.ts, discord.ts, telegram.ts, gmail.ts) are expected to be completed in Phase 4.2
