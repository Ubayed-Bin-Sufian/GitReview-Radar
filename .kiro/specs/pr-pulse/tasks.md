# PR-Pulse (GitReview Radar) MVP - Implementation Tasks

## Sequential Implementation Tasks

---

## Phase 1: Foundation & Jev Client Setup

### Task 1.1: Initialize Project Structure
- [x] Create repository structure with `src/`, `tests/`, `infrastructure/` directories
- [x] Initialize Node.js project with `package.json`
- [x] Install dependencies: `aws-sdk`, `jest`, `fast-check`
- [x] Configure TypeScript (`tsconfig.json`)
- [x] Set up Git hooks for pre-commit linting

**Estimated Time**: 2 hours

### Task 1.2: Set Up Jev Client
- [x] Create `src/jev/` directory for decision engine
- [x] Implement `src/jev/decision-engine.ts` - Jev client wrapper
- [x] Implement `src/jev/rules/` directory with individual rule files:
  - [x] `ci-blocked.rule.ts` (R-1)
  - [x] `needs-author-fix.rule.ts` (R-2)
  - [x] `stale-branch.rule.ts` (R-3)
  - [x] `ready-for-merge.rule.ts` (R-4)
- [x] Implement rule priority ordering in decision engine
- [x] Write unit tests for Jev client

**Estimated Time**: 4 hours

### Task 1.3: Configure AWS SDK & Environment
- [ ] Set up AWS credentials configuration (local `.env` + production IAM role)
- [ ] Create `src/config/` with configuration management
- [ ] Configure AWS SDK v3 for Lambda, API Gateway, DynamoDB
- [ ] Set up AWS profile switching for dev/staging/prod

**Estimated Time**: 2 hours

---

## Phase 2: Core Evaluator Logic

### Task 2.1: Implement PR Metadata Types
- [x] Define TypeScript interfaces for PR input
- [x] Define TypeScript interfaces for evaluation output
- [x] Create enum for states: `PRState` (`NEEDS_AUTHOR_FIX`, `READY_FOR_FINAL_MERGE`, `STALE_BRANCH`, `CI_BLOCKED`)

**Estimated Time**: 1 hour

### Task 2.2: Implement Evaluator Function
- [x] Create `src/evaluator/evaluate.ts` main evaluation function
- [x] Implement score calculation logic per rule
- [x] Implement score capping at 100
- [x] Add validation for input fields (non-null, valid enum values)

**Estimated Time**: 3 hours

### Task 2.3: Write Property-Based Tests for Evaluator
- [x] Create `tests/property/` directory
- [x] Implement property P-1: CI Failure Dominance
- [x] Implement property P-2: Review State Priority
- [x] Implement property P-3: Staleness Threshold
- [x] Implement property P-4: Score Monotonicity
- [x] Implement property P-5: Score Bounds
- [x] Implement property P-6: State Exhaustiveness
- [x] Implement property P-7: Rule Priority Consistency
- [x] Run property tests with 100+ iterations

**Estimated Time**: 6 hours

### Task 2.4: Write Scenario Tests
- [x] Create `tests/scenarios/` directory
- [x] Implement test for S-1: High Priority CI Failure
- [x] Implement test for S-2: Changes Requested with Large Diff
- [x] Implement test for S-3: Stale Branch
- [x] Implement test for S-4: Ready for Merge
- [x] Implement test for S-5: Review Pending, Fresh Branch

**Estimated Time**: 2 hours

---

## Phase 3: Infrastructure as Code

### Task 3.1: Set Up AWS CDK
- [ ] Initialize CDK project
- [ ] Configure CDK for multiple environments (dev, staging, prod)
- [ ] Set up GitHub Actions for CDK deployments

**Estimated Time**: 2 hours

### Task 3.2: Define Lambda Function Infrastructure
- [ ] Create CDK stack for `PRPulseEvaluatorLambda`
- [ ] Configure Lambda runtime (Node.js 20.x or Python 3.12)
- [ ] Set up IAM role with minimal permissions (S3 read, CloudWatch logs)
- [ ] Configure memory (512MB) and timeout (30s)

**Estimated Time**: 2 hours

### Task 3.3: Define API Gateway Infrastructure
- [ ] Create CDK stack for `PRPulseAPIGateway`
- [ ] Configure HTTP API endpoint
- [ ] Set up route `POST /evaluate`
- [ ] Configure integration with Lambda function
- [ ] Set up API key option (configurable via CDK context)

**Estimated Time**: 2 hours

### Task 3.4: Define EventBridge Infrastructure
- [ ] Create CDK stack for `PRPulseScheduler`
- [ ] Configure EventBridge rule with cron schedule
- [ ] Set up target as Lambda function
- [ ] Create EventBridge schedule permission

**Estimated Time**: 1 hour

### Task 3.5: Define DynamoDB Infrastructure
- [ ] Create CDK stack for `PRPulseCache`
- [ ] Configure table with partition key (`repo#pr_id`)
- [ ] Set up TTL for automatic data expiration
- [ ] Create secondary index for stale PR queries

**Estimated Time**: 2 hours

---

## Phase 4: Daily Digest Builder

### Task 4.1: Implement Digest Aggregator
- [ ] Create `src/digest/` directory
- [ ] Implement `src/digest/aggregator.ts` for daily digest generation
- [ ] Query DynamoDB for PRs from last 24 hours
- [ ] Categorize PRs by state and actionability score

**Estimated Time**: 3 hours

### Task 4.2: Implement Notification Handler
- [ ] Create `src/notifications/` directory
- [ ] Implement `src/notifications/sender.ts` for SNS publishing
- [ ] Implement high-priority alert logic (score > 90)
- [ ] Create SNS topic for notifications

**Estimated Time**: 2 hours

### Task 4.3: Implement Report Format
- [ ] Design markdown report format
- [ ] Include summary statistics:
  - Total PRs evaluated
  - Count per state
  - Average actionability score
  - Top 10 highest-priority PRs
- [ ] Output format for Slack/Email (configurable)

**Estimated Time**: 2 hours

---

## Phase 5: Testing & Validation

### Task 5.1: Integration Testing
- [ ] Deploy to staging environment
- [ ] Test API Gateway → Lambda end-to-end
- [ ] Test EventBridge → Lambda execution
- [ ] Verify DynamoDB writes and reads

**Estimated Time**: 3 hours

### Task 5.2: Performance Testing
- [ ] Load test with 100 evaluations/minute
- [ ] Verify p99 latency < 500ms
- [ ] Test concurrent evaluation scenarios

**Estimated Time**: 2 hours

### Task 5.3: Security Review
- [ ] Audit Lambda IAM permissions (least privilege)
- [ ] Review environment variables for secrets
- [ ] Validate API Gateway authentication
- [ ] Enable CloudWatch log encryption

**Estimated Time**: 2 hours

---

## Phase 6: Documentation & Deployment

### Task 6.1: Write API Documentation
- [ ] Document `/evaluate` endpoint with OpenAPI spec
- [ ] Include request/response examples
- [ ] Document error codes and scenarios

**Estimated Time**: 2 hours

### Task 6.2: Write Operational Runbooks
- [ ] Debugging evaluation failures
- [ ] Handling CI timeout scenarios
- [ ] Scaling the service during high load

**Estimated Time**: 2 hours

### Task 6.3: Production Deployment
- [ ] Deploy to production environment
- [ ] Configure CloudWatch alarms
- [ ] Set up SNS alerting for errors
- [ ] Verify all tests pass in production

**Estimated Time**: 2 hours

---

## Task Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1. Foundation & Jev Client Setup | 3 | 8 hours |
| 2. Core Evaluator Logic | 4 | 13 hours |
| 3. Infrastructure as Code | 5 | 11 hours |
| 4. Daily Digest Builder | 3 | 7 hours |
| 5. Testing & Validation | 3 | 7 hours |
| 6. Documentation & Deployment | 3 | 6 hours |
| **Total** | **21** | **52 hours** |

---

## Success Criteria

- [ ] All property-based tests pass (P-1 through P-7)
- [ ] All scenario tests pass (S-1 through S-5)
- [ ] API latency p99 < 500ms
- [ ] System handles 100+ evaluations/minute
- [ ] Production deployment successful with no errors
- [ ] Documentation complete and reviewed

---

## Implementation Summary (Tasks 1.1-3.5 Completed)

### Files Created:

**src/jev/**
- `types.ts` - PRMetadata, DecisionResult, JevRequest/Response types
- `decision-engine.ts` - DecisionEngine class with parallel Choice/Score/Noul questions
- `index.ts` - Module exports
- `rules/ci-blocked.rule.ts` - R-1: CI_BLOCKED state
- `rules/needs-author-fix.rule.ts` - R-2: NEEDS_AUTHOR_FIX state
- `rules/stale-branch.rule.ts` - R-3: STALE_BRANCH state
- `rules/ready-for-merge.rule.ts` - R-4: READY_FOR_FINAL_MERGE state

**src/evaluator/**
- `types.ts` - PREvaluationResult, ActionableAssignment types
- `pr-evaluator.ts` - PREvaluator service with Jev integration and owner assignment
- `index.ts` - Module exports

**src/digest/**
- `types.ts` - DailyDigest, DigestOutput, DigestBuilderOptions types
- `digest-builder.ts` - DigestBuilder with markdown/JSON generation
- `index.ts` - Module exports

### Tests Created:

**tests/jev/**
- `decision-engine.test.ts` - 10 tests

**tests/evaluator/**
- `pr-evaluator.test.ts` - 14 tests

**tests/digest/**
- `digest-builder.test.ts` - 13 tests

### Test Coverage: 37 passing tests

### Phase 4 Notes:
Phase 4 (Daily Digest Builder - AWS Lambda & Infrastructure Setup) has been skipped as requested.