# Code Conventions: PR-Pulse (GitReview Radar)

## TypeScript Coding Standards

### File Naming
- `*.ts` for TypeScript files
- `*.test.ts` for test files
- `*.spec.ts` for spec files (less common)
- `index.ts` for module entry points
- `types.ts` for type definitions

### Directory Structure
```
src/
├── jev/          # Jev decision engine
├── evaluator/    # PR evaluation logic
├── digest/       # Digest builder
├── handlers/     # Lambda entry points
├── config/       # Configuration management
├── notifications/ # Notification handlers
└── errors/       # Custom error classes
```

### Import Ordering
1. External dependencies (Node.js, npm packages)
2. Local module imports (src/*)
3. Type imports (types.ts)
4. Constants and utilities

### BAD (Non-compliant):
```typescript
// Random import order
import { evaluate } from '../evaluator';
import * as fs from 'fs';
import { PRMetadata } from '../types';
import { calculateScore } from './score';
```

### GOOD (Compliant):
```typescript
// Explicit, ordered imports
import { PRMetadata } from '../jev/types';
import { PREvaluator, ActionableAssignment } from '../evaluator/types';

import { PREvaluationResult } from '../evaluator';
import { calculateScore } from './score';
import { DigestBuilder } from '../digest/digest-builder';

import { DecisionEngine } from '../jev';
```

---

## Type Safety Rules

### NEVER use `any`:
```typescript
// BAD
export function processResult(result: any): void { ... }
export const evaluator: any = new PREvaluator();

// GOOD
export function processResult(result: PREvaluationResult): void { ... }
export const evaluator: PREvaluator = new PREvaluator();
```

### ALWAYS import types from source:
```typescript
// BAD
// Importing from compiled output
import { PRMetadata } from '../dist/jev/types';

// GOOD
import { PRMetadata } from '../jev/types';
```

### USE explicit type annotations:
```typescript
// BAD
const state = 'CI_BLOCKED'; // Inferred as string literal

// GOOD
const state: PRState = 'CI_BLOCKED'; // Explicit type
```

### USE discriminated unions for state:
```typescript
// BAD
interface Result {
  success: boolean;
  data?: any;
  error?: any;
}

// GOOD
interface SuccessResult {
  success: true;
  data: PREvaluationResult;
}

interface ErrorResult {
  success: false;
  error: ApiError;
}

type EvaluationResult = SuccessResult | ErrorResult;
```

---

## Module Exports

### Always export complete module surface:
```typescript
// BAD
export { PREvaluator } from './pr-evaluator';
// Missing types and other exports

// GOOD
export * from './pr-evaluator';
export * from './types';
```

### NEVER re-export without documentation:
```typescript
// BAD
export { DecisionEngine } from '../jev/decision-engine';
// Unclear what's being exported

// GOOD
/**
 * Decision engine for Jev-based PR evaluation
 */
export { DecisionEngine } from '../jev/decision-engine';
```

---

## Code Formatting Standards

### Braces and Indentation
- Use 2 spaces for indentation (never tabs)
- Opening brace on same line as statement
- Closing brace on new line

### BAD (Non-compliant):
```typescript
export async function evaluatePR(pr:PRMetadata)
{
const result=await decisionEngine.evaluate(pr)
  return result
}
```

### GOOD (Compliant):
```typescript
export async function evaluatePR(pr: PRMetadata): Promise<DecisionResult> {
  const result = await decisionEngine.evaluate(pr);
  return result;
}
```

### Line Length
- Maximum 120 characters per line
- Break long lines after operators or commas
- Align continuation lines

### BAD (Non-compliant):
```typescript
// Too long line
const result = await evaluatePR(pr_metadata, repo, author, diff_size, review_status, ci_build_state, branch_staleness_days, additional_fields);
```

### GOOD (Compliant):
```typescript
const result = await evaluatePR(
  pr_metadata,
  repo,
  author,
  diff_size,
  review_status,
  ci_build_state,
  branch_staleness_days,
  additional_fields
);
```

### Comments and Documentation
- Use JSDoc for public APIs
- Explain WHY, not WHAT
- Keep comments up to date

### BAD (Non-compliant):
```typescript
// BAD
// Calculate score
function calculateScore(pr) {
  return pr.diff_size * 2;
}

// GOOD
/**
 * Calculate actionability score for a PR based on diff size
 * Score increases with larger diffs
 * 
 * @param pr - PR metadata with diff_size
 * @returns Actionability score (0-100)
 */
function calculateScore(pr: PRMetadata): number {
  return Math.min(Math.round(pr.diff_size / 100) * 10, 100);
}
```

---

## Naming Conventions

| Entity | Case | Example |
|--------|------|---------|
| Types/Interfaces | PascalCase | `PRMetadata`, `DecisionResult` |
| Enums | PascalCase | `ReviewStatus`, `CIState` |
| Variables | camelCase | `diffSize`, `branchStalenessDays` |
| Functions | camelCase | `evaluatePR`, `calculateScore` |
| Classes | PascalCase | `DecisionEngine`, `PREvaluator` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Modules | camelCase | `decision-engine.ts` |

### BAD (Non-compliant):
```typescript
// Incorrect casing
const pr_id = '123';  // Should be camelCase: prId
interface PR_METADATA { ... }  // Should be PascalCase
function evaluate_pr() { ... }  // Should be camelCase
```

### GOOD (Compliant):
```typescript
const prId = '123';
interface PRMetadata { ... }
function evaluatePR() { ... }
```