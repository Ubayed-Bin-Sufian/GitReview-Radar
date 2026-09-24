# API Standards: PR-Pulse (GitReview Radar)

## REST API Conventions

### Endpoint: POST /evaluate

Evaluate a single PR and return actionability state with Next-Step Owner assignment.

#### Request Payload
```json
{
  "pr_id": "string (required)",
  "repo": "string (required)",
  "author": "string (required)",
  "diff_size": "integer (required, >= 0)",
  "review_status": "APPROVED|CHANGES_REQUESTED|PENDING (required)",
  "ci_build_state": "SUCCESS|FAILED|PENDING|ERROR (required)",
  "branch_staleness_days": "integer (required, >= 0)"
}
```

#### Response Payload
```json
{
  "pr_id": "string",
  "repo": "string",
  "author": "string",
  "state": "CI_BLOCKED|NEEDS_AUTHOR_FIX|STALE_BRANCH|READY_FOR_FINAL_MERGE",
  "actionability_score": "integer (0-100)",
  "evaluated_rules": "string[]",
  "actionable_assignment": {
    "owner": "Author|Reviewer|Maintainer",
    "action": "string",
    "priority": "integer (1-5)"
  },
  "evaluated_at": "ISO8601 timestamp"
}
```

#### HTTP Status Code Mappings

| Status | Condition | Description |
|--------|-----------|-------------|
| 200 | Success | PR evaluation completed successfully |
| 400 | Bad Request | Invalid or missing required fields |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unhandled error during evaluation |
| 502 | Bad Gateway | Jev API unavailable |
| 504 | Gateway Timeout | Jev API timeout (> 30s) |

---

## BAD vs GOOD Code Examples

### BAD (Non-compliant):
```typescript
// Loose type checking, missing validation
export async function evaluateHandler(event: any) {
  const body = JSON.parse(event.body);
  
  // No input validation
  const result = await evaluator.evaluatePR(body);
  
  // Missing error handling
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
}

// Inconsistent response format
return {
  status: 200,  // Should be 'statusCode'
  data: result  // Should be 'body'
};

// Missing error details
return {
  statusCode: 400,
  body: 'Invalid input'  // No structured error response
};
```

### GOOD (Compliant):
```typescript
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PREvaluator } from '../evaluator';
import { DecisionEngine } from '../jev';
import { ValidationException } from '../errors';

// Strict type definitions
export interface EvaluateRequest {
  pr_id: string;
  repo: string;
  author: string;
  diff_size: number;
  review_status: 'APPROVED' | 'CHANGES_REQUESTED' | 'PENDING';
  ci_build_state: 'SUCCESS' | 'FAILED' | 'PENDING' | 'ERROR';
  branch_staleness_days: number;
}

// Validation utility
function validateEvaluateRequest(body: unknown): EvaluateRequest {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationException('Request body must be a valid object');
  }

  const requiredFields: (keyof EvaluateRequest)[] = [
    'pr_id', 'repo', 'author', 'diff_size', 'review_status',
    'ci_build_state', 'branch_staleness_days'
  ];

  for (const field of requiredFields) {
    if (!(field in body)) {
      throw new ValidationException(`Missing required field: ${field}`);
    }
  }

  // Type-safe validation
  if (typeof body.diff_size !== 'number' || body.diff_size < 0) {
    throw new ValidationException('diff_size must be a non-negative integer');
  }

  if (!['APPROVED', 'CHANGES_REQUESTED', 'PENDING'].includes(body.review_status)) {
    throw new ValidationException('Invalid review_status value');
  }

  return body as EvaluateRequest;
}

// Structured error response
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

// Handler with proper validation and error handling
export async function evaluateHandler(
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> {
  try {
    const body = validateEvaluateRequest(JSON.parse(event.body || '{}'));
    
    const evaluator = new PREvaluator(new DecisionEngine());
    const result = await evaluator.evaluatePR(body);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-PR-Pulse-Version': '1.0.0'
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        statusCode: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString()
          }
        })
      };
    }

    // Unhandled error
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          timestamp: new Date().toISOString()
        }
      })
    };
  }
}
```

### BAD (Non-compliant):
```typescript
// No rate limiting, no idempotency
export async function scheduledDigestHandler() {
  // Direct database calls, no configuration
  const results = await database.getAllEvaluations();
  
  // No retry logic for failed digests
  await sendToSlack(results);
}
```

### GOOD (Compliant):
```typescript
import { EventBridgeEvent } from 'aws-lambda';
import { DigestBuilder } from '../digest';
import { PREvaluator } from '../evaluator';
import { DecisionEngine } from '../jev';
import { sendToWebhook } from '../notifications';

// Environment configuration
const config = {
  WEBHOOK_URL: process.env.DIGEST_WEBHOOK_URL,
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000
};

// Idempotent handler with retry logic
export async function scheduledDigestHandler(
  event: EventBridgeEvent<'ScheduledEvent', void>
): Promise<void> {
  const evaluator = new PREvaluator(new DecisionEngine());
  const builder = new DigestBuilder();
  
  // Get PRs from cache (DynamoDB)
  const prs = await getPendingPRs(); // Implemented elsewhere
  
  // Batch evaluate with rate limiting
  const results = await evaluator.evaluateBatch(prs);
  
  // Build digest
  const digestOutput = builder.buildDigestOutput(results);
  
  // Send with retry logic
  for (let attempt = 1; attempt <= config.MAX_RETRIES; attempt++) {
    try {
      await sendToWebhook(config.WEBHOOK_URL, digestOutput);
      return;
    } catch (error) {
      if (attempt === config.MAX_RETRIES) {
        throw error;
      }
      await sleep(attempt * 1000); // Exponential backoff
    }
  }
}
```

---

## Response Serialization Guidelines

### Always:
- Use `JSON.stringify(result, null, 2)` for human-readable responses
- Include `X-PR-Pulse-Version` header
- Set `Content-Type: application/json` header
- Use consistent field naming (snake_case in request, camelCase in response)

### Never:
- Return `undefined` or `null` in response body
- Include sensitive data (API keys, tokens, credentials)
- Omit error response structure on non-200 status codes
- Use dynamic keys in response objects

### Date Formatting:
- Use `new Date().toISOString()` for all timestamps
- Store as ISO8601 strings in DynamoDB