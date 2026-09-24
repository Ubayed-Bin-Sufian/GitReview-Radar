# Technology Stack: PR-Pulse

## Runtime & Frameworks
- **Language:** TypeScript (Node.js 20.x / ES2022)
- **AI Decision Model:** TypeSafe AI Jev API (System One parallel evaluation)
- **HTTP Client:** Native `fetch` / `undici` (for Node.js environment)
- **Testing:** Jest + `fast-check` for Property-Based Testing (PBT)
- **Deployment Platform:** 100% Stateless Serverless on AWS (Lambda + API Gateway + EventBridge)

## Core Dependencies

### Jev Integration
- `undici` - HTTP client with native fetch compatibility
- TypeSafe AI Jev API endpoint: `https://api.typesafe.ai/jev/v1/chat/completions`

### AWS SDK (v3)
- `@aws-sdk/client-lambda` - Lambda function management
- `@aws-sdk/client-dynamodb` - DynamoDB for PR cache
- `@aws-sdk/client-eventbridge` - EventBridge cron scheduling
- `@aws-sdk/client-sns` - SNS notifications for high-priority alerts

### Testing Framework
- `jest` - Unit and integration testing
- `ts-jest` - TypeScript preprocessor for Jest
- `fast-check` - Property-based testing for decision rules
- `undici` - Mockable HTTP client for tests

## Architecture Patterns

### Stateless Design
- No in-memory state across Lambda invocations
- All data persisted to DynamoDB (PR cache, evaluation history)
- Pure functions for all evaluation logic (deterministic)

### Jev Parallel Evaluation
Single JSON payload containing all primitive questions:
```json
{
  "questions": [
    { "type": "choice", "name": "action_state", "choices": [...] },
    { "type": "score", "name": "actionability_score", "min": 0, "max": 100 },
    { "type": "noul", "name": "ci_failed_check" }
  ]
}
```

## Build & Test Tools
- TypeScript 5.x with strict mode
- Jest with 37+ passing unit tests
- `tsconfig.json` with ES2020 target and commonjs module
- Pre-commit hooks via Husky for linting and type checking

## Deployment Target
- **Runtime:** Node.js 20.x
- **Memory:** 512MB
- **Timeout:** 30s
- **Cold Start Optimization:** SnapStart or provisioned concurrency for production
