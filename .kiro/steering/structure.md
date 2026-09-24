# Project Structure: PR-Pulse

## File Hierarchy

```
/home/ubayed/GitReview-Radar/
├── src/
│   ├── jev/                     # Jev decision engine and rule implementations
│   │   ├── types.ts             # TypeScript types for PR metadata, Jev questions/responses
│   │   ├── decision-engine.ts   # DecisionEngine class with parallel Choice/Score/Noul
│   │   ├── index.ts             # Module exports
│   │   └── rules/
│   │       ├── ci-blocked.rule.ts         # R-1: CI_BLOCKED state evaluation
│   │       ├── needs-author-fix.rule.ts   # R-2: NEEDS_AUTHOR_FIX state evaluation
│   │       ├── stale-branch.rule.ts       # R-3: STALE_BRANCH state evaluation
│   │       └── ready-for-merge.rule.ts    # R-4: READY_FOR_FINAL_MERGE state evaluation
│   ├── evaluator/               # Core PR evaluation logic
│   │   ├── types.ts             # PREvaluationResult, ActionableAssignment types
│   │   ├── pr-evaluator.ts      # PREvaluator service with owner assignment
│   │   └── index.ts             # Module exports
│   ├── digest/                  # Daily digest builder
│   │   ├── types.ts             # DailyDigest, DigestOutput types
│   │   ├── digest-builder.ts    # DigestBuilder with markdown/JSON generation
│   │   └── index.ts             # Module exports
│   ├── handlers/                # AWS Lambda entry points
│   │   ├── evaluate.ts          # POST /evaluate Lambda handler
│   │   └── digest.ts            # Daily digest trigger handler
│   └── index.ts                 # Root module exports
├── tests/
│   ├── jev/
│   │   └── decision-engine.test.ts    # 10 tests for DecisionEngine
│   ├── evaluator/
│   │   └── pr-evaluator.test.ts       # 14 tests for PREvaluator
│   └── digest/
│       └── digest-builder.test.ts     # 13 tests for DigestBuilder
├── .kiro/
│   ├── specs/pr-pulse/          # Feature spec artifacts
│   │   ├── requirements.md      # EARS notation requirements (5 rules, 5 scenarios)
│   │   ├── design.md            # Serverless architecture + property tests
│   │   └── tasks.md             # 21 sequential implementation tasks
│   └── steering/                # Workspace steering documents
│       ├── product.md           # Product overview and target users
│       ├── tech.md              # Technology stack documentation
│       ├── structure.md         # Project structure guide
│       └── pr-pulse-standards.md # Build/test invariants and code standards
├── .husky/                      # Git hooks for pre-commit linting
├── package.json                 # Dependencies (aws-sdk, jest, fast-check)
├── tsconfig.json                # TypeScript configuration
├── jest.config.js               # Jest configuration
└── .gitignore                   # Excludes node_modules, .env, dist, coverage
```

## Directory Descriptions

### `src/jev/` - Jev Decision Engine
Contains the TypeSafe AI Jev API wrapper that accepts PR metadata and constructs parallel Choice (action state), Score (0-100), and Noul (boolean checks) questions. Implements the 4 decision rules (R-1 through R-4) for state classification.

### `src/evaluator/` - Core Evaluator
Implements the `PREvaluator` service that consumes PR metadata, passes through JevDecisionEngine, and maps output to actionable Next-Step Owner assignments (Author, Reviewer, Maintainer) with priority scoring.

### `src/digest/` - Daily Digest Builder
Contains `DigestBuilder` class that generates structured Markdown and JSON daily digest summaries grouped by NextStepOwner with priority sorting. Handles state breakdown, stale PR identification, and CI blocked alerts.

### `src/handlers/` - AWS Lambda Entry Points
Lambda function handlers for:
- `evaluate.ts`: API Gateway-triggered evaluation endpoint
- `digest.ts`: EventBridge cron-triggered daily digest generation

### `tests/` - Test Suite
Jest test suites with 37 total passing tests:
- `tests/jev/`: Decision engine unit tests
- `tests/evaluator/`: Evaluator and owner assignment tests
- `tests/digest/`: Digest builder output format tests

### `.kiro/specs/pr-pulse/` - Feature Specs
EARS notation requirements, serverless architecture design, and sequential implementation tasks for PR-Pulse MVP.

### `.kiro/steering/` - Steering Documents
Workspace-level steering rules that enforce type safety, stateless design, and Jev parallel primitive conventions across all development.
