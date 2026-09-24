# Security Policies: PR-Pulse (GitReview Radar)

## Input Validation Rules

### PR Metadata Validation
All PR metadata inputs must be validated before processing:

```typescript
export function validatePRMetadata(input: unknown): PRMetadata {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Input must be a valid object');
  }

  const requiredFields: (keyof PRMetadata)[] = [
    'pr_id', 'repo', 'author', 'diff_size', 
    'review_status', 'ci_build_state', 'branch_staleness_days'
  ];

  for (const field of requiredFields) {
    if (!(field in input)) {
      throw new ValidationError(`Missing required field: ${field}`);
    }
  }

  const pr = input as PRMetadata;

  // Validate types and ranges
  if (typeof pr.pr_id !== 'string' || pr.pr_id.length === 0) {
    throw new ValidationError('pr_id must be a non-empty string');
  }

  if (typeof pr.repo !== 'string' || pr.repo.length === 0) {
    throw new ValidationError('repo must be a non-empty string');
  }

  if (typeof pr.diff_size !== 'number' || pr.diff_size < 0) {
    throw new ValidationError('diff_size must be a non-negative integer');
  }

  if (!['APPROVED', 'CHANGES_REQUESTED', 'PENDING'].includes(pr.review_status)) {
    throw new ValidationError('Invalid review_status value');
  }

  if (!['SUCCESS', 'FAILED', 'PENDING', 'ERROR'].includes(pr.ci_build_state)) {
    throw new ValidationError('Invalid ci_build_state value');
  }

  if (typeof pr.branch_staleness_days !== 'number' || pr.branch_staleness_days < 0) {
    throw new ValidationError('branch_staleness_days must be a non-negative integer');
  }

  return pr;
}
```

---

## Sanitization Standards

### Never trust external input:
```typescript
// BAD
export async function evaluatePR(pr: any) {
  // No sanitization - assumes input is safe
  return decisionEngine.evaluate(pr);
}

// GOOD
export async function evaluatePR(pr: unknown) {
  const validatedPR = validatePRMetadata(pr);
  return decisionEngine.evaluate(validatedPR);
}
```

### Sanitize error messages:
```typescript
// BAD
// Exposing internal details
return {
  error: error.stack,  // Exposes file paths, stack trace
  details: error.message
};

// GOOD
return {
  error: 'VALIDATION_ERROR',
  message: 'Invalid PR metadata format',
  timestamp: new Date().toISOString()
};
```

### Sanitize user input for logging:
```typescript
// BAD
logger.info(`Evaluating PR: ${pr.pr_id}, author: ${pr.author}, token: ${process.env.API_KEY}`);

// GOOD
logger.info(`Evaluating PR: ${sanitize(pr.pr_id)}, author: ${sanitize(pr.author)}`);
```

---

## AWS Secret Handling

### Environment Variables Required:
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `JEV_API_KEY` | TypeSafe AI API key | Yes | None |
| `AWS_REGION` | AWS region for services | No | us-east-1 |
| `DIGEST_WEBHOOK_URL` | Webhook URL for daily digests | No | None |
| `DATABASE_TABLE_NAME` | DynamoDB table name | No | PRPulse-Cache-dev |

### NEVER hardcode credentials:
```typescript
// BAD
const apiKey = 'sk-1234567890abcdef';  // Hardcoded API key
const dbPassword = 'supersecret123';   // Hardcoded password

// GOOD
const apiKey = process.env.JEV_API_KEY;
if (!apiKey) {
  throw new Error('JEV_API_KEY environment variable is required');
}
```

### Use dotenv for local development only:
```typescript
// BAD
// Committing .env files to repository
process.env.JEV_API_KEY = 'sk-1234567890abcdef';

// GOOD
// .env.example template (safe to commit)
JEV_API_KEY=your-api-key-here
DIGEST_WEBHOOK_URL=https://hooks.example.com/pr-pulse
```

---

## BAD vs GOOD Code Comparisons

### BAD (Non-compliant):
```typescript
// Hardcoded credentials
const config = {
  apiKey: 'sk-abc123xyz789',  // Committed to repo
  dbPassword: 'admin123',      // Hardcoded
};

// No input validation
export async function evaluatePR(event: any) {
  const body = JSON.parse(event.body);
  return decisionEngine.evaluate(body);  // Direct pass-through
}

// Exposing secrets in logs
logger.error(`API call failed: ${error.response.data}`, {
  apiKey: config.apiKey,  // Exposing secret
  stack: error.stack      // Exposing internal details
});

// Insecure environment variable access
const apiKey = process.env.JEV_API_KEY || 'fallback-key';  // Insecure fallback
```

### GOOD (Compliant):
```typescript
// Secure configuration
export interface Config {
  readonly jevApiKey: string;
  readonly digestWebhookUrl?: string;
  readonly databaseTableName: string;
}

export function getConfig(): Config {
  const jevApiKey = process.env.JEV_API_KEY;
  if (!jevApiKey) {
    throw new Error('JEV_API_KEY environment variable is required');
  }

  return {
    jevApiKey,
    digestWebhookUrl: process.env.DIGEST_WEBHOOK_URL,
    databaseTableName: process.env.DATABASE_TABLE_NAME || 'PRPulse-Cache-dev',
  };
}

// Secure function with input validation
export async function evaluatePR(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  const config = getConfig();
  
  try {
    const body = JSON.parse(event.body || '{}');
    const validatedPR = validatePRMetadata(body);
    
    const evaluator = new PREvaluator(new DecisionEngine(config.jevApiKey));
    const result = await evaluator.evaluatePR(validatedPR);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error) {
    return handleApiError(error);
  }
}

// Secure logging
logger.error('API call failed', {
  error: error.message,  // Safe error message
  timestamp: new Date().toISOString(),
});
```

### BAD (Non-compliant):
```typescript
// Storing secrets in code
const API_KEY = 'sk-1234567890abcdef';

export async function getPRMetadata(prId: string): Promise<PRMetadata> {
  const response = await fetch(`https://api.github.com/repos/owner/repo/pulls/${prId}`, {
    headers: {
      Authorization: `token ${API_KEY}`,  // Hardcoded token
    },
  });
  return response.json();
}
```

### GOOD (Compliant):
```typescript
// Dynamic secret loading
export function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  return token;
}

export async function getPRMetadata(prId: string): Promise<PRMetadata> {
  const token = getGitHubToken();
  const response = await fetch(`https://api.github.com/repos/owner/repo/pulls/${prId}`, {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  const data = await response.json();
  
  return {
    pr_id: prId,
    repo: data.head.repo.full_name,
    author: data.user.login,
    diff_size: data.additions + data.deletions,
    review_status: data.requested_reviewers?.length ? 'PENDING' : 'APPROVED',
    ci_build_state: 'SUCCESS',  // Would be fetched from CI API
    branch_staleness_days: calculateStaleness(data.created_at),
  };
}
```

### BAD (Non-compliant):
```typescript
// No rate limiting, vulnerable to abuse
export async function evaluatePR(event: APIGatewayEvent) {
  const body = JSON.parse(event.body);
  const result = await evaluator.evaluatePR(body);
  return { statusCode: 200, body: JSON.stringify(result) };
}

// No input size limits
export async function processLargePR(event: APIGatewayEvent) {
  // No validation on large payloads
  const body = JSON.parse(event.body);  // Could be 10MB+
  return { statusCode: 200, body: JSON.stringify(body) };
}
```

### GOOD (Compliant):
```typescript
// Rate limiting and input validation
export async function evaluatePR(event: APIGatewayEvent) {
  const body = JSON.parse(event.body);
  
  // Validate input size
  if (event.headers['Content-Length'] && 
      parseInt(event.headers['Content-Length']) > 10240) {  // 10KB limit
    throw new ValidationError('Request body exceeds maximum size (10KB)');
  }
  
  // Rate limiting check (implementation depends on deployment)
  const rateLimit = checkRateLimit(event.requestContext.identity.sourceIp);
  if (!rateLimit.allowed) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Rate limit exceeded' }) };
  }
  
  const result = await evaluator.evaluatePR(body);
  return { statusCode: 200, body: JSON.stringify(result) };
}
```