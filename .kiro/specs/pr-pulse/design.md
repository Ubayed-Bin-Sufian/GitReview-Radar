# PR-Pulse (GitReview Radar) MVP - Design

## 100% Stateless Serverless Architecture

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    API Gateway                                  │
│                              (POST /evaluate)                                   │
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
│   EventBridge Cron   │           │   SNS Topic          │          │   DynamoDB Streams       │
│   (Daily Digest)     │           │   (Notifications)    │          │   (Audit Log)            │
└──────────────────────┘           └──────────────────────┘          └──────────────────────────┘
           │                                     │                                 │
           ▼                                     ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            AWS Infrastructure                                     │
│  • Lambda (Node.js 20.x or Python 3.12)                                        │
│  • API Gateway (HTTP API for low latency)                                      │
│  • EventBridge (Cron for scheduled evaluations)                                │
│  • SNS (Notifications for high-priority PRs)                                   │
│  • DynamoDB (Durable storage for PR cache, no server state)                    │
│  • CloudWatch (Logging, Metrics, Alarms)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Component Specifications

### 2.1 Lambda Evaluator Function

**Runtime**: Node.js 20.x or Python 3.12

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
  "actionability_score": "integer",
  "evaluated_at": "ISO8601 timestamp",
  "evaluated_rules": "array of rule names applied"
}
```

**Statelessness**: All state is externalized to DynamoDB (read-only cache of PR metadata) or derived from input. The function itself maintains no in-memory state between invocations.

### 2.2 API Gateway Configuration

- **Type**: HTTP API (lower latency, cost-effective)
- **Endpoint**: `POST /evaluate`
- **Authentication**: IAM or API Key (configurable via stage variables)
- **CORS**: Enabled for web dashboard access

### 2.3 EventBridge Cron Schedule

- **Schedule**: `cron(0 9 * * ? *)` (9 AM UTC daily)
- **Target**: Lambda Evaluator (batch mode)
- **Input**: Repository list and date range for stale PRs

### 2.4 DynamoDB Table

**Table Name**: `PRPulse-Cache-{Environment}`

| Partition Key | Sort Key | Attributes |
|---------------|----------|------------|
| `repo#pr_id` | `METADATA#timestamp` | `author`, `diff_size`, `review_status`, `ci_build_state`, `branch_staleness_days` |

**Purpose**: Durable cache of PR metadata (read from GitHub API once, store for evaluation)

## 3. Property-Based Test Invariants

Property-based tests verify that the evaluator logic satisfies mathematical properties regardless of input values.

### P-1: CI Failure Dominance
```
PROPERTY: CI Failure Always Results in CI_BLOCKED
FORALL PR inputs where ci_build_state = FAILED:
    OUTPUT.state MUST EQUAL "CI_BLOCKED"
    OUTPUT.score MUST BE >= 95
```

### P-2: Review State Priority
```
PROPERTY: Changes Requested Takes Priority Over Staleness
FORALL PR inputs where ci_build_state ≠ FAILED AND review_status = "CHANGES_REQUESTED":
    OUTPUT.state MUST EQUAL "NEEDS_AUTHOR_FIX"
    OUTPUT.state MUST NOT EQUAL "STALE_BRANCH" OR "READY_FOR_FINAL_MERGE"
```

### P-3: Staleness Threshold
```
PROPERTY: Stale Branch Detection Has Clear Boundary
FORALL PR inputs where branch_staleness_days > 7 AND ci_build_state ≠ FAILED AND review_status ≠ "CHANGES_REQUESTED":
    OUTPUT.state MUST EQUAL "STALE_BRANCH"
FORALL PR inputs where branch_staleness_days <= 7 AND ci_build_state ≠ FAILED AND review_status ≠ "CHANGES_REQUESTED":
    OUTPUT.state MUST NOT EQUAL "STALE_BRANCH"
```

### P-4: Score Monotonicity by Diff Size
```
PROPERTY: Larger Diff Increases Score (for same state)
FORALL pairs of PRs where all fields are identical EXCEPT diff_size:
    IF diff_size_A > diff_size_B AND states are equal:
        OUTPUT.score_A >= OUTPUT.score_B
```

### P-5: Score Bounds
```
PROPERTY: Actionability Score Always in Range [0, 100]
FORALL PR inputs:
    OUTPUT.actionability_score >= 0
    OUTPUT.actionability_score <= 100
```

### P-6: State Exhaustiveness
```
PROPERTY: Exactly One State Output
FORALL PR inputs:
    OUTPUT.state MUST BE ONE OF: "NEEDS_AUTHOR_FIX", "READY_FOR_FINAL_MERGE", "STALE_BRANCH", "CI_BLOCKED"
    OUTPUT.state MUST NOT BE NULL OR UNDEFINED
```

### P-7: Rule Priority Consistency
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

## 4. Test Strategy

### 4.1 Unit Tests (Jest / pytest)
- Test each rule in isolation
- Test boundary conditions (diff_size = 0, branch_staleness_days = 7, etc.)

### 4.2 Property-Based Tests (fast-check / Hypothesis)
- Generate random PR metadata
- Verify all properties P-1 through P-7
- Run 100+ test cases per property

### 4.3 Integration Tests
- API Gateway to Lambda end-to-end
- EventBridge cron to Lambda execution

### 4.4 Manual Test Scenarios
- All scenarios from requirements.md (S-1 through S-5)

## 5. Deployment Strategy

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

## 6. Monitoring & Observability

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