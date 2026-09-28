# Requirements Document

## Introduction

PR-Pulse (GitReview Radar) is an open-source developer tool that ingests Pull Request metadata, evaluates actionability using TypeSafe AI's Jev model, and outputs daily prioritization digests for maintainers and engineering teams.

This requirements document defines the MVP functionality for the PR-Pulse system, including:

- PR metadata sync and classification into actionable states
- Actionability score calculation (0-100)
- Jev-based decision engine using parallel Choice Score, and Noul primitives
- Daily digest generation and connector-based notification delivery

---



## Glossary


| Term                | Definition                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| PR                  | Pull Request - A proposed change to a code repository                                           |
| Actionability Score | A 0-100 score indicating how urgently a PR requires attention                                   |
| State               | The classification result: CI_BLOCKED, NEEDS_AUTHOR_FIX, STALE_BRANCH, or READY_FOR_FINAL_MERGE |
| Jev                 | TypeSafe AI's decision engine for parallel primitive evaluation                                 |
| Choice              | A Jev primitive that selects from predefined options                                            |
| Score               | A Jev primitive that outputs a numeric value within a range                                     |
| Noul                | A Jev primitive that evaluates boolean conditions                                               |
| Diff Size           | The number of lines changed in a PR                                                             |
| Branch Staleness    | The number of days since a branch was created or last updated                                   |
| Review Status       | The current state of code review: APPROVED, CHANGES_REQUESTED, or PENDING                       |
| CI Build State      | The status of continuous integration checks: SUCCESS, FAILED, PENDING, or ERROR                 |


---



## EARS Notation: Expectations, Acceptance, Rules, Scenarios

---



## Requirements



### 1.1 Core Expectation

**CE-1**: The system shall ingest Pull Request (PR) metadata from GitHub (via user-triggered sync) and classify each PR into a defined set of actionable states to help engineering teams prioritize review efforts.

### 1.2 Actionability Expectation

**CE-2**: The system shall calculate an Actionability Score (0-100) for each PR, where higher scores indicate PRs requiring immediate attention.

---



### 1.3 Acceptance Criteria



### AC-1: PR Metadata Ingestion

**Given** a PR from GitHub with metadata fields: `diff_size`, `review_status`, `ci_build_state`, `branch_staleness_days`
**When** the system receives the PR data
**Then** all four metadata fields shall be captured and stored for evaluation

### AC-2: State Classification

**Given** any valid PR metadata input
**When** the system evaluates the PR
**Then** the system shall output exactly one of four enum states:

- `NEEDS_AUTHOR_FIX`: PR requires author changes before review
- `READY_FOR_FINAL_MERGE`: PR is ready for merge
- `STALE_BRANCH`: PR branch is stale and may need rebasing
- `CI_BLOCKED`: PR has failing CI checks



### AC-3: Actionability Score

**Given** any PR with a classified state
**When** the system calculates the score
**Then** the score shall be an integer between 0 and 100 (inclusive)

### AC-4: Sync Stores PRs and Issues

**Given** an authenticated user triggers a sync for a configured repository
**When** the system fetches open PRs and open issues from GitHub
**Then** the system shall upsert:

- PR rows with `head_sha`, `diff_size`, `review_status`, `ci_build_state`, `branch_staleness_days`, and the Jev-derived `state`/`actionability_score`
- Issue rows (listed only) with `github_number`, `title`, `author`, `state`, and `html_url`



### AC-5: Bring-Your-Own Jev Key

**Given** a user has saved a Jev API key in the dashboard settings
**When** the system performs PR evaluation during sync
**Then** it shall call Jev using the user's key (no shared server-side Jev key requirement).

### AC-6: Connector-Based Daily Delivery

**Given** a user has enabled a connector and turned on the daily-summary toggle
**When** the daily job runs
**Then** the system shall send exactly one daily digest per enabled connector, and shall not send to disabled connectors.

---



### 1.4 Rules (Jev Decision Primitives)



### R-1: CI Build State Priority Rule

```
IF ci_build_state = FAILED THEN
    state = CI_BLOCKED
    score = 95 + (diff_size / 100)
    capped at 100
END IF
```



### R-2: Review Status Rule

```
IF ci_build_state ≠ FAILED AND review_status = "CHANGES_REQUESTED" THEN
    state = NEEDS_AUTHOR_FIX
    score = 85 + (diff_size / 200)
    capped at 100
END IF
```



### R-3: Branch Staleness Rule

```
IF branch_staleness_days > 7 THEN
    state = STALE_BRANCH
    score = 70 + (branch_staleness_days * 2)
    capped at 100
END IF
```



### R-4: Ready for Merge Rule

```
IF branch_staleness_days <= 7 THEN
    state = READY_FOR_FINAL_MERGE
    score = 0 + (review_status = "APPROVED" ? 50 : 25) + (diff_size / 500)
    capped at 100
END IF
```



### R-5: Decision Priority Rule

```
Rules R-1 through R-4 shall be evaluated in order.
The first rule whose condition evaluates to TRUE shall determine the state.
Subsequent rules shall be skipped.
```

---



### 1.5 Scenarios



### S-1: High Priority CI Failure

```
Input:
  diff_size: 250
  review_status: "APPROVED"
  ci_build_state: "FAILED"
  branch_staleness_days: 2

Expected Output:
  state: CI_BLOCKED
  score: 100 (capped from 95 + 2.5 = 97.5)
```



### S-2: Changes Requested with Large Diff

```
Input:
  diff_size: 800
  review_status: "CHANGES_REQUESTED"
  ci_build_state: "PENDING"
  branch_staleness_days: 5

Expected Output:
  state: NEEDS_AUTHOR_FIX
  score: 100 (capped from 85 + 4 = 89)
```



### S-3: Stale Branch

```
Input:
  diff_size: 100
  review_status: "APPROVED"
  ci_build_state: "SUCCESS"
  branch_staleness_days: 14

Expected Output:
  state: STALE_BRANCH
  score: 98 (70 + 14 * 2 = 98)
```



### S-4: Ready for Merge

```
Input:
  diff_size: 50
  review_status: "APPROVED"
  ci_build_state: "SUCCESS"
  branch_staleness_days: 3

Expected Output:
  state: READY_FOR_FINAL_MERGE
  score: 75 (50 + 0.1 = 50.1, rounded)
```



### S-5: Review Pending, Fresh Branch

```
Input:
  diff_size: 200
  review_status: "PENDING"
  ci_build_state: "SUCCESS"
  branch_staleness_days: 1

Expected Output:
  state: READY_FOR_FINAL_MERGE
  score: 35 (25 + 0.4 = 25.4, rounded)
```

---



### 1.6 Non-Functional Requirements



### NFR-1: Latency

The evaluation function shall complete within 500ms for 95% of requests.

### NFR-2: Availability

The evaluation endpoint shall be available 99.9% of the time during business hours.

### NFR-3: Throughput

The system shall handle at least 100 PR evaluations per minute during peak hours.

---



### 1.7 Testing Strategy

**Unit Tests (Jest):**
- Decision rules in isolation
- Boundary conditions (diff_size = 0, branch_staleness_days = 7)
- Error handling paths
- Edge cases (empty strings, null values, extreme values)

**Property-Based Tests (fast-check):**
- Validate 8 correctness properties across hundreds of generated inputs
- Use mathematical properties instead of specific examples
- Run 100+ iterations per property for comprehensive coverage
- Separate test files in `tests/property/` directory

**Test Organization:**
```
tests/
├── jev/decision-engine.test.ts
├── evaluator/pr-evaluator.test.ts
├── digest/digest-builder.test.ts
└── property/property-tests.test.ts
```

### 1.8 Data Dictionary


| Field                   | Type    | Description                                                                             |
| ----------------------- | ------- | --------------------------------------------------------------------------------------- |
| `diff_size`             | integer | Number of lines changed in the PR                                                       |
| `review_status`         | enum    | One of: "APPROVED", "CHANGES_REQUESTED", "PENDING"                                      |
| `ci_build_state`        | enum    | One of: "SUCCESS", "FAILED", "PENDING", "ERROR"                                         |
| `branch_staleness_days` | integer | Number of days since the branch was created or last updated                             |
| `state`                 | enum    | Output state: "NEEDS_AUTHOR_FIX", "READY_FOR_FINAL_MERGE", "STALE_BRANCH", "CI_BLOCKED" |
| `actionability_score`   | integer | Score from 0-100 indicating urgency                                                     |
| `head_sha`              | string  | GitHub head SHA used to skip rebilling on unchanged PRs                                 |
| `next_step_owner`       | enum    | "Author"                                                                                |


