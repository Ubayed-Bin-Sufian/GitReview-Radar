# PR-Pulse (GitReview Radar) MVP - Design

## Overview

PR-Pulse (GitReview Radar) is a serverless application that evaluates Pull Request actionability using TypeSafe AI's Jev decision engine. The system ingests PR metadata, calculates actionability scores, and outputs prioritized daily digests for maintainers and engineering teams.

**Key Capabilities:**
- User-triggered PR sync and evaluation via API Gateway (`POST /sync`, `POST /evaluate`)
- Scheduled daily digest generation via EventBridge (cron)
- Durable state storage in Supabase (user settings, synced PRs/issues, and connector toggles)
- Connector-based daily delivery (Slack/Discord/Telegram/Gmail), configurable per user
- Structured Markdown and JSON digest output

**Architecture Goals:**
- 100% stateless Lambda functions
- Deterministic Jev-based evaluation (System One parallel primitives)
- Low-latency API responses (<500ms p99)
- Cost-effective serverless deployment

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    API Gateway                                  │
│                           (POST /sync, POST /evaluate)                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   Lambda Evaluator                              │
│                              (stateless function)                               │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │  PR Evaluator Logic                                                      │  │
│  │  - Parse PR metadata                                                     │  │
│  │  - Apply Jev decision rules                                              │  │
│  │  - Calculate Actionability Score                                         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                 │
           ┌─────────────────────────────────────┼─────────────────────────────────┐
           │                                     │                                 │
           ▼                                     ▼                                 ▼
┌──────────────────────┐           ┌──────────────────────┐          ┌──────────────────────────┐
│   EventBridge Cron   │           │   Connector Plugins  │          │   Supabase (PR data)     │
│   (Daily Digest)     │           │   (Notifications)    │          │   (Audit Log)            │
└──────────────────────┘           └──────────────────────┘          └──────────────────────────┘
           │                                     │                                 │
           ▼                                     ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            AWS Infrastructure                                     │
│  • Lambda (Node.js 24.x)                                                       │
│  • API Gateway (HTTP API for low latency)                                      │
│  • EventBridge (Cron for scheduled evaluations)                                │
│  • Connector Plugins (Slack/Discord/Telegram/Gmail)                          │
│  • Supabase (user data + synced PRs/issues)                                 │
│  • CloudWatch (Logging, Metrics, Alarms)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Component Flow

1. **Dashboard (S3)** signs in and configures repos/connectors in Supabase
2. **API Gateway** receives `POST /sync` for a configured repo
3. **Lambda Sync Handler** fetches open PRs and open issues from GitHub and upserts them into Supabase; PRs are classified with Jev during sync using the user's Jev key
4. **EventBridge Cron** triggers the daily digest job
5. **Lambda Digest Job** reads stored PR evaluations and connector toggles from Supabase, builds the digest, and dispatches it via enabled connector plugins

---

## Components and Interfaces

### 1. Lambda Evaluator Function

**Runtime**: Node.js 24.x

**Input**: PR Metadata JSON
```json
{
  "pr_id": "string",
  "repo": "string",
  "author": "string",
  "diff_size": "integer",
  "review_status": "APPROVED|CHANGES_REQUESTED|PENDING",
  "ci_build_state": "SUCCESS|FAILED|PENDING|ERROR",
  "branch_staleness_days": "integer"
}
```

**Output**: Evaluation Result
```json
{
  "pr_id": "string",
  "state": "NEEDS_AUTHOR_FIX|READY_FOR_FINAL_MERGE|STALE_BRANCH|CI_BLOCKED",
  "actionability_score": "integer (0-100)",
  "evaluated_at": "ISO8601 timestamp",
  "evaluated_rules": "array of rule names applied",
  "actionable_assignment": {
    "owner": "Author|Reviewer|Maintainer",
    "action": "string",
    "priority": "integer (1-5)"
  }
}
```

**Statelessness**: All state is externalized to Supabase or derived from input. The function maintains no in-memory state between invocations.

### 2. Decision Engine Interface

```typescript
interface DecisionEngine {
  evaluate(pr: PRMetadata): Promise<DecisionResult>;
}
```

**Responsibilities:**
- Construct parallel Jev payload (Choice, Score, Noul primitives)
- Call TypeSafe AI Jev API
- Parse and validate decision response

### 3. PR Evaluator Interface

```typescript
interface PREvaluator {
  evaluatePR(pr: PRMetadata): Promise<PREvaluationResult>;
  assignOwner(state: PRState): ActionableAssignment;
}
```

**Responsibilities:**
- Validate input PR metadata
- Delegate to DecisionEngine
- Map decision state to Next-Step Owner
- Calculate priority based on actionability score

### 4. Digest Builder Interface

```typescript
interface DigestBuilder {
  buildDigest(results: PREvaluationResult[]): DailyDigest;
  generateMarkdown(digest: DailyDigest): string;
  generateJSON(digest: DailyDigest): string;
}
```

**Responsibilities:**
- Group evaluations by Next-Step Owner
- Sort by priority
- Format as Markdown/JSON for notifications

### 5. API Gateway Configuration

| Setting | Value |
|---------|-------|
| Type | HTTP API |
| Endpoint | `POST /evaluate` |
| Authentication | IAM or API Key |
| CORS | Enabled |
| Latency Target | <500ms p99 |

### 6. Supabase Data Storage

- `user_settings`: per-user Jev key and GitHub token
- `repositories`: configured repos and last sync timestamp
- `pull_requests`: synced PR metadata plus Jev `state`/`actionability_score` and `next_step_owner`
- `issues`: open issues listed only
- `connectors`: connector plugin id, enabled toggle, and config json

---

## Data Models

### PRMetadata

```typescript
interface PRMetadata {
  pr_id: string;
  repo: string;
  author: string;
  diff_size: number;
  review_status: 'APPROVED' | 'CHANGES_REQUESTED' | 'PENDING';
  ci_build_state: 'SUCCESS' | 'FAILED' | 'PENDING' | 'ERROR';
  branch_staleness_days: number;
}
```

### DecisionResult

```typescript
interface DecisionResult {
  state: PRState;
  actionability_score: number;
  evaluated_rules: string[];
}
```

### PREvaluationResult

```typescript
interface PREvaluationResult extends DecisionResult {
  pr_id: string;
  repo: string;
  author: string;
  evaluated_at: string; // ISO8601
  actionable_assignment: ActionableAssignment;
}
```

### ActionableAssignment

```typescript
interface ActionableAssignment {
  owner: 'Author' | 'Reviewer' | 'Maintainer';
  action: string;
  priority: number; // 1-5
}
```

### DailyDigest

```typescript
interface DailyDigest {
  generated_at: string;
  pr_count: number;
  state_breakdown: Record<PRState, number>;
  by_owner: Record<NextStepOwner, PREvaluationResult[]>;
  top_priorities: PREvaluationResult[];
  stale_alerts: PREvaluationResult[];
  ci_blocked_alerts: PREvaluationResult[];
}
```

### PRState Type

```typescript
type PRState = 
  | 'CI_BLOCKED' 
  | 'NEEDS_AUTHOR_FIX' 
  | 'STALE_BRANCH' 
  | 'READY_FOR_FINAL_MERGE';
```

### NextStepOwner Type

```typescript
type NextStepOwner = 'Author' | 'Reviewer' | 'Maintainer';
```

---

## Correctness Properties

### Property 1: CI Failure Dominance
**Validates: Requirements R-1**
```
PROPERTY: CI Failure Always Results in CI_BLOCKED
FORALL PR inputs where ci_build_state = FAILED:
    OUTPUT.state MUST EQUAL "CI_BLOCKED"
    OUTPUT.score MUST BE >= 95
```

### Property 2: Review State Priority
**Validates: Requirements R-2**
```
PROPERTY: Changes Requested Takes Priority Over Staleness
FORALL PR inputs where ci_build_state ≠ FAILED AND review_status = "CHANGES_REQUESTED":
    OUTPUT.state MUST EQUAL "NEEDS_AUTHOR_FIX"
    OUTPUT.state MUST NOT EQUAL "STALE_BRANCH" OR "READY_FOR_FINAL_MERGE"
```

### Property 3: Staleness Threshold
**Validates: Requirements R-3**
```
PROPERTY: Stale Branch Detection Has Clear Boundary
FORALL PR inputs where branch_staleness_days > 7 AND ci_build_state ≠ FAILED AND review_status ≠ "CHANGES_REQUESTED":
    OUTPUT.state MUST EQUAL "STALE_BRANCH"
FORALL PR inputs where branch_staleness_days <= 7 AND ci_build_state ≠ FAILED AND review_status ≠ "CHANGES_REQUESTED":
    OUTPUT.state MUST NOT EQUAL "STALE_BRANCH"
```

### Property 4: Ready for Merge Fallthrough
**Validates: Requirements R-4**
```
PROPERTY: All Non-Blocked PRs With Clean State Resolve to READY_FOR_FINAL_MERGE
FORALL PR inputs where ci_build_state ≠ FAILED AND review_status ≠ "CHANGES_REQUESTED" AND branch_staleness_days <= 7:
    OUTPUT.state MUST EQUAL "READY_FOR_FINAL_MERGE"
    OUTPUT.actionability_score MUST BE >= 25
    OUTPUT.actionability_score MUST BE <= 100
```

### Property 5: Score Monotonicity by Diff Size
**Validates: Requirements R-1, R-2, R-3, R-4**
```
PROPERTY: Larger Diff Increases Score (for same state)
FORALL pairs of PRs where all fields are identical EXCEPT diff_size:
    IF diff_size_A > diff_size_B AND states are equal:
        OUTPUT.score_A >= OUTPUT.score_B
```

### Property 6: Score Bounds
**Validates: Requirements R-1, R-2, R-3, R-4**
```
PROPERTY: Actionability Score Always in Range [0, 100]
FORALL PR inputs:
    OUTPUT.actionability_score >= 0
    OUTPUT.actionability_score <= 100
```

### Property 7: State Exhaustiveness
**Validates: Requirements AC-2**
```
PROPERTY: Exactly One State Output
FORALL PR inputs:
    OUTPUT.state MUST BE ONE OF: "NEEDS_AUTHOR_FIX", "READY_FOR_FINAL_MERGE", "STALE_BRANCH", "CI_BLOCKED"
    OUTPUT.state MUST NOT BE NULL OR UNDEFINED
```

### Property 8: Rule Priority Consistency
**Validates: Requirements R-5**
```
PROPERTY: Rules Applied in Correct Order
FORALL PR inputs:
    IF ci_build_state = FAILED:
        RULES APPLIED MUST CONTAIN "R-1" AND NOT CONTAIN "R-2", "R-3", OR "R-4"
    ELSE IF review_status = "CHANGES_REQUESTED":
        RULES APPLIED MUST CONTAIN "R-2" AND NOT CONTAIN "R-3" OR "R-4"
    ELSE IF branch_staleness_days > 7:
        RULES APPLIED MUST CONTAIN "R-3" AND NOT CONTAIN "R-4"
    ELSE:
        RULES APPLIED MUST CONTAIN "R-4" ONLY
```

---

## Error Handling

### Input Validation Errors

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 400 | VALIDATION_ERROR | Missing or invalid required fields |
| 400 | INVALID_STATE | PR state values out of allowed range |

### Jev API Errors

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 502 | JEV_API_UNAVAILABLE | TypeSafe AI Jev API is unreachable |
| 504 | JEV_API_TIMEOUT | Jev API response exceeded timeout |
| 500 | JEV_API_ERROR | Jev API returned unexpected error |

### Internal Errors

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 500 | INTERNAL_ERROR | Unexpected server error |

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: diff_size",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Retry Strategy

- **API Gateway**: No retry (client handles retries)
- **Lambda**: Retry 2x with exponential backoff for transient errors
- **Connector Dispatch**: Retry 3x with exponential backoff

### Logging Strategy

```typescript
logger.error('Evaluation failed', {
  pr_id: pr.pr_id,
  error_code: 'JEV_API_TIMEOUT',
  timestamp: new Date().toISOString(),
  correlation_id: correlationId
});
```

---

## Testing Strategy

### Unit Tests (Jest)

**Test Coverage Requirements:**
- All decision rules in isolation
- Boundary conditions (diff_size = 0, branch_staleness_days = 7)
- Error handling paths
- Edge cases (empty strings, null values, extreme values)

**Test Files:**
- `tests/jev/decision-engine.test.ts` - DecisionEngine tests
- `tests/evaluator/pr-evaluator.test.ts` - PREvaluator tests
- `tests/digest/digest-builder.test.ts` - DigestBuilder tests

### Property-Based Tests (fast-check)

**Purpose:**
Comprehensive validation of the 8 correctness properties (P-1 through P-8) using mathematical property testing. Unlike unit tests that verify specific examples, property-based tests validate general behavioral properties across hundreds of automatically generated inputs.

**Testing Strategy:**
- Use `fast-check` library for property-based testing
- Run 100+ iterations per property to ensure comprehensive coverage
- Separate PBT tests from unit tests for clear organization
- Target edge cases and boundary conditions that manual examples might miss

**Test File Organization:**
```
tests/
├── jev/                     # Unit tests for Jev decision engine
│   └── decision-engine.test.ts
├── evaluator/               # Unit tests for PR evaluation
│   └── pr-evaluator.test.ts
├── digest/                  # Unit tests for digest builder
│   └── digest-builder.test.ts
└── property/                # Property-based tests (PBT)
    ├── property-tests.test.ts  # All 8 correctness properties
```

**Property Testing Standards:**
- Each property test runs at least 100 iterations (configurable)
- Use `fc.assert(fc.property(...), { numRuns: 100 })` pattern
- Include boundary-specific generators (e.g., `fc.integer({ min: 0, max: 7 })` for threshold testing)
- Combine multiple generators to test interaction effects
- Use `fc.oneof()` and `fc.constant()` for state-specific testing

**Implemented Correctness Properties:**
1. **P-1: CI Failure Dominance** - CI failures always result in CI_BLOCKED state with score >= 95
2. **P-2: Review State Priority** - Changes requested takes priority over branch staleness
3. **P-3: Staleness Threshold** - Clear boundary at 7 days for stale detection
4. **P-4: Ready for Merge Fallthrough** - Clean PRs resolve to READY_FOR_FINAL_MERGE
5. **P-5: Score Monotonicity** - Larger diffs increase scores for same state
6. **P-6: Score Bounds** - All scores remain in valid range [0, 100]
7. **P-7: State Exhaustiveness** - Exactly one output state from defined set
8. **P-8: Rule Priority Consistency** - Rules applied in correct priority order

**Example Property Test Structure:**
```typescript
import * as fc from 'fast-check';
import { evaluatePR } from '../src/evaluator';

describe('Property-Based Tests', () => {
  describe('P-1: CI Failure Dominance', () => {
    it('should always return CI_BLOCKED when CI is FAILED', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),  // diff_size
          fc.integer({ min: 0, max: 30 }),    // branch_staleness_days
          (diffSize, staleness) => {
            const pr = {
              diff_size: diffSize,
              review_status: 'APPROVED',
              ci_build_state: 'FAILED',  // Always FAILED
              branch_staleness_days: staleness,
              pr_id: 'test',
              repo: 'test',
              author: 'test',
            };

            const result = evaluatePR(pr);
            expect(result.state).toBe('CI_BLOCKED');
            expect(result.actionability_score).toBeGreaterThanOrEqual(95);
          }
        ),
        { numRuns: 100 }  // 100 iterations
      );
    });
  });
});
```

### Integration and manual tests
After deployment, validate:
- `POST /sync` stores PRs/issues into Supabase
- the EventBridge daily job dispatches a digest via enabled connectors

### Manual Test Scenarios

**Test Cases:**
- All scenarios from requirements.md (S-1 through S-5)
- Edge cases not covered by automated tests
- UI/dashboard verification (when applicable)

### Test Execution

```bash
# All tests (unit + property-based)
npm test

# Unit tests only
npm run test:unit

# Property-based tests only
npm run test:property
```

### Code Coverage Targets

- Unit tests: >90% coverage
- Property-based tests: 100% coverage of correctness properties

---

## Deployment Strategy

### Environment Stages
1. **dev**: Development testing
2. **staging**: Acceptance testing with real GitHub data
3. **prod**: Production

### Infrastructure as Code
- AWS CDK (TypeScript) for infrastructure definitions
- Version-controlled infrastructure changes

### CI/CD Pipeline
```
GitHub PR → CodeBuild (test) → Deploy to staging → Manual approval → Deploy to prod
```

---

## Monitoring & Observability

### CloudWatch Alarms
- Lambda errors > 1% of invocations
- API Gateway 5xx errors > 1%
- Evaluation latency p99 > 500ms

### Metrics
- `EvaluationCount` (per state)
- `EvaluationDuration` (p50, p95, p99)
- `ActionabilityScoreAverage`

### Logging
- Structured JSON logs
- Correlation ID for each evaluation request
