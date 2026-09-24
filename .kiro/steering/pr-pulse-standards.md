# PR-Pulse Steering Rules

## Intent & Context
Enforce strict TypeScript type safety, 100% stateless serverless architecture, and deterministic Jev decision payload handling across all project components for PR-Pulse (GitReview Radar).

## Rules & Standards
1. **Type Safety**: All PR metadata structures, decision payloads, and NextStepOwner types MUST be explicitly typed and imported from `src/jev/types.ts` or `src/evaluator/types.ts`. Never use `any`.
2. **Stateless Lambda Design**: Lambda handlers MUST remain completely stateless. Externalize data dependencies to DynamoDB or pure function evaluations without maintaining in-memory state across invocations.
3. **Jev Parallel Primitive Conventions**: Jev API calls MUST pass Choice, Score, and Noul primitive questions in a single JSON payload array to allow System One to evaluate them in parallel and keep execution latencies under 500ms.

## Code Standard Comparison

### BAD (Non-compliant):
```typescript
// Loosely typed, sequential/non-parallel Jev queries with missing type safety
async function evaluatePR(pr: any) {
  const choiceRes = await fetch("https://api.typesafe.ai/jev/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ pr_id: pr.id, question: "What is the action state?" })
  });
  const scoreRes = await fetch("https://api.typesafe.ai/jev/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ pr_id: pr.id, question: "What is the urgency score?" })
  });
  return { choice: await choiceRes.json(), score: await scoreRes.json() };
}
```

### GOOD (Compliant):
```typescript
import { PRMetadata, JevRequest, DecisionResult } from "../jev/types";

// Explicitly typed, parallel System One evaluation wrapper
export async function evaluatePR(pr: PRMetadata): Promise<DecisionResult> {
  const requestPayload: JevRequest = {
    state: pr,
    questions: [
      {
        type: "choice",
        id: "action_state",
        options: ["CI_BLOCKED", "NEEDS_AUTHOR_FIX", "STALE_BRANCH", "READY_FOR_FINAL_MERGE"]
      },
      {
        type: "score",
        id: "actionability_score",
        min: 0,
        max: 100
      },
      {
        type: "noul",
        id: "is_stale"
      }
    ]
  };

  const response = await fetch("https://api.typesafe.ai/jev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload)
  });

  return (await response.json()) as DecisionResult;
}
```

## General Build & Test Invariants

### Type Safety & Exports

**BAD (Non-compliant):**
```typescript
// Using 'any' - loses all type safety
import { PREvaluationResult } from './types';

async function processResult(result: any) {
  console.log(result.state); // No type checking
  result.actionable_assignment.priority = 10; // Can assign invalid value
}

// Missing explicit exports from modules
export const version = '1.0.0'; // Should export types too
```

**GOOD (Compliant):**
```typescript
// Explicit type imports from source files
import { PREvaluationResult } from '../evaluator/types';
import { PRMetadata } from '../jev/types';
import { NextStepOwner } from '../evaluator/types';

// All functions explicitly typed
export async function processResult(result: PREvaluationResult): Promise<void> {
  const { state, actionable_assignment } = result;
  const priority: number = actionable_assignment.priority; // Type-safe access
}

// Complete module exports
export * from './types';
export * from './pr-evaluator';
```

### Dependency & Module Resolution

**BAD (Non-compliant):**
```typescript
// Missing fetch import - causes runtime errors
// No type definitions for fetch
export async function makeRequest() {
  return fetch('https://api.example.com'); // Unresolved reference
}

// AWS SDK imports with missing types
import AWS from 'aws-sdk'; // Wrong import pattern for v3
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'; // Correct, but needs types
```

**GOOD (Compliant):**
```typescript
// Explicit import for fetch
import { fetch } from 'undici';
// OR use global fetch with proper type definitions in jest.setup.js
// declare global { const fetch: typeof import('undici').fetch; }

// AWS SDK v3 explicit imports
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';

// Export type definitions
export type { DynamoDBClient, SNSClient, EventBridgeClient };
```

### Test Isolation & Mocks

**BAD (Non-compliant):**
```typescript
// Real network calls in tests - causes flaky tests and timeouts
describe('PREvaluator', () => {
  it('should evaluate PR', async () => {
    const evaluator = new PREvaluator(new DecisionEngine());
    // This will make real HTTP requests to Jev API
    const result = await evaluator.evaluatePR(prMetadata);
    // Test will fail due to network issues, not logic
  });
});

// Missing mock cleanup - tests pollute global state
beforeEach(() => {
  global.fetch = mockFetch; // No cleanup after tests
});

// Environment variables not mocked
const apiKey = process.env.JEV_API_KEY; // Test fails if env var missing
```

**GOOD (Compliant):**
```typescript
// Complete fetch mocking with Jest
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch;
});

afterEach(() => {
  jest.clearAllMocks(); // Clean mock state after each test
});

describe('PREvaluator', () => {
  it('should evaluate PR', async () => {
    const mockResult = {
      state: 'CI_BLOCKED',
      actionability_score: 95,
      evaluated_rules: ['R-1'],
    };
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    const evaluator = new PREvaluator(mockDecisionEngine);
    const result = await evaluator.evaluatePR(prMetadata);
    
    expect(result.state).toBe('CI_BLOCKED');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// Environment variables mocked
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});
```

### Functional & Stateless Invariants

**BAD (Non-compliant):**
```typescript
// Mutable global state - violates stateless architecture
let cache: Record<string, PREvaluationResult> = {};

export function evaluateWithCache(pr: PRMetadata) {
  if (cache[pr.pr_id]) {
    return cache[pr.pr_id]; // State persists across invocations
  }
  const result = expensiveCalculation(pr);
  cache[pr.pr_id] = result; // Mutates global state
  return result;
}

// Side effects in pure functions
export function calculateScore(pr: PRMetadata): number {
  console.log('Evaluating', pr.pr_id); // Side effect
  fs.writeFileSync('/tmp/log.txt', JSON.stringify(pr)); // File system access
  return pr.diff_size * 2;
}
```

**GOOD (Compliant):**
```typescript
// Pure functions with no side effects
export function calculateScore(pr: PRMetadata): number {
  // Only use input parameters, no external dependencies
  return Math.min(Math.max(Math.round(pr.diff_size * 0.5), 0), 100);
}

// State externalized to database (DynamoDB)
export class DatabaseCache {
  constructor(private readonly client: DynamoDBClient) {}
  
  async getPR(prId: string): Promise<PREvaluationResult | null> {
    // Read from DynamoDB, no in-memory state
    const params = { ... };
    return this.client.getItem(params).then(parseResult);
  }
  
  async setPR(result: PREvaluationResult): Promise<void> {
    // Write to DynamoDB, no in-memory cache
    const params = { ... };
    return this.client.putItem(params).promise();
  }
}

// Handler remains stateless across invocations
export async function lambdaHandler(event: APIGatewayEvent) {
  // Create fresh instances for each invocation
  const evaluator = new PREvaluator(new DecisionEngine());
  const result = await evaluator.evaluatePR(parsePR(event.body));
  
  // Return result, do not mutate global state
  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
}
```
