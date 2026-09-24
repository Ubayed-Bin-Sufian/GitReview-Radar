# Testing Standards: PR-Pulse (GitReview Radar)

## Test Organization

### Directory Structure
```
tests/
├── jev/                    # Jev decision engine tests
│   └── decision-engine.test.ts
├── evaluator/              # Evaluator tests
│   └── pr-evaluator.test.ts
├── digest/                 # Digest builder tests
│   └── digest-builder.test.ts
└── property/               # Property-based tests (optional)
```

### Test File Naming
- `*.test.ts` for unit tests
- Use descriptive names: `{module}.{feature}.test.ts`
- Test suites grouped by module (jev, evaluator, digest)

---

## Jest Unit Testing Patterns

### Test Structure
```typescript
describe('ModuleName', () => {
  // Shared setup
  let service: ModuleService;
  
  beforeEach(() => {
    service = new ModuleService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('feature', () => {
    it('should handle happy path', async () => {
      // Arrange
      const input = { ... };
      
      // Act
      const result = await service.process(input);
      
      // Assert
      expect(result).toMatchObject({ ... });
    });

    it('should handle edge case', async () => {
      // ...
    });
  });
});
```

### BAD (Non-compliant):
```typescript
// No describe nesting, unclear test organization
it('should work', async () => {
  const result = await evaluator.evaluatePR(prData);
  expect(result.state).toBe('CI_BLOCKED');
});

// Tests with side effects
it('should return error', () => {
  process.env.API_KEY = 'real-key';  // Modifies global state
  // ...
});

// No cleanup
afterEach(() => {
  // Missing cleanup
});
```

### GOOD (Compliant):
```typescript
import { PREvaluator } from '../../src/evaluator/pr-evaluator';
import { DecisionEngine } from '../../src/jev';
import { PRMetadata, PRState } from '../../src/jev/types';
import { PREvaluationResult } from '../../src/evaluator/types';

// Mock module
jest.mock('../../src/jev/decision-engine');

describe('PREvaluator', () => {
  let evaluator: PREvaluator;
  const mockDecisionEngine = {
    evaluate: jest.fn(),
  } as any;

  beforeEach(() => {
    evaluator = new PREvaluator(mockDecisionEngine);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('evaluatePR', () => {
    const basePR: PRMetadata = {
      pr_id: '123',
      repo: 'test-repo',
      author: 'test-user',
      diff_size: 100,
      review_status: 'APPROVED',
      ci_build_state: 'SUCCESS',
      branch_staleness_days: 2,
    };

    it('should evaluate PR with CI failure', async () => {
      // Arrange
      mockDecisionEngine.evaluate.mockResolvedValueOnce({
        state: 'CI_BLOCKED',
        actionability_score: 95,
        evaluated_rules: ['R-1'],
      });

      // Act
      const result = await evaluator.evaluatePR(basePR);

      // Assert
      expect(result.state).toBe('CI_BLOCKED');
      expect(result.actionable_assignment.owner).toBe('Maintainer');
      expect(result.actionable_assignment.priority).toBe(5);
      expect(mockDecisionEngine.evaluate).toHaveBeenCalledTimes(1);
    });

    it('should fallback to Reviewer for unknown state', async () => {
      // Arrange
      mockDecisionEngine.evaluate.mockResolvedValueOnce({
        state: 'UNKNOWN_STATE' as any,
        actionability_score: 50,
        evaluated_rules: [],
      });

      // Act
      const result = await evaluator.evaluatePR(basePR);

      // Assert
      expect(result.actionable_assignment.owner).toBe('Reviewer');
      expect(result.actionable_assignment.priority).toBe(1);
    });
  });

  describe('assignOwner', () => {
    it('should return correct owner for each state', () => {
      const states: PRState[] = [
        'CI_BLOCKED',
        'NEEDS_AUTHOR_FIX',
        'STALE_BRANCH',
        'READY_FOR_FINAL_MERGE',
      ];

      const expectedOwners: ('Maintainer' | 'Author')[] = [
        'Maintainer',
        'Author',
        'Author',
        'Maintainer',
      ];

      states.forEach((state, index) => {
        const assignment = evaluator.assignOwner(state);
        expect(assignment.owner).toBe(expectedOwners[index]);
      });
    });
  });
});
```

---

## Property-Based Testing (fast-check)

### PBT Standards
- Test mathematical properties, not specific examples
- Use `fast-check` for property-based testing
- Run at least 100 iterations per property

### Property-Based Tests Location
- `tests/property/` directory for PBT
- Separate from unit tests (clear separation)

### BAD (Non-compliant):
```typescript
// Not using fast-check, just random examples
it('should work with various inputs', () => {
  const inputs = [
    { diff_size: 100, ... },
    { diff_size: 200, ... },
    { diff_size: 500, ... },
    // Missing comprehensive coverage
  ];
});

// Testing specific examples instead of properties
it('should give correct score', () => {
  expect(calculateScore(100)).toBe(100);
});
```

### GOOD (Compliant):
```typescript
import * as fc from 'fast-check';
import { calculateScore, PRState } from '../src/evaluator';

describe('Property-Based Tests', () => {
  describe('P-1: CI Failure Dominance', () => {
    it('should always return CI_BLOCKED when CI is FAILED', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),  // diff_size
          fc.integer({ min: 0, max: 30 }),    // branch_staleness_days
          fc.constant('FAILED'),               // ci_build_state (always FAILED)
          fc.constant('APPROVED'),             // review_status
          (diffSize, staleness) => {
            const pr = {
              diff_size: diffSize,
              review_status: 'APPROVED',
              ci_build_state: 'FAILED',
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

  describe('P-2: Review State Priority', () => {
    it('should prioritize CHANGES_REQUESTED over staleness', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),   // diff_size
          fc.integer({ min: 8, max: 30 }),     // branch_staleness_days (> 7)
          fc.constant('CHANGES_REQUESTED'),     // review_status (always requested)
          fc.constant('SUCCESS'),               // ci_build_state (not FAILED)
          (diffSize, staleness) => {
            const pr = {
              diff_size: diffSize,
              review_status: 'CHANGES_REQUESTED',
              ci_build_state: 'SUCCESS',
              branch_staleness_days: staleness,
              pr_id: 'test',
              repo: 'test',
              author: 'test',
            };

            const result = evaluatePR(pr);
            expect(result.state).toBe('NEEDS_AUTHOR_FIX');
            expect(result.state).not.toBe('STALE_BRANCH');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('P-3: Staleness Threshold Boundary', () => {
    it('should have clear boundary at 7 days', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 30 }),
          fc.oneof(
            fc.constant(7),    // Exactly 7 days (not stale)
            fc.integer({ min: 8, max: 30 })  // Stale (> 7)
          ),
          (diffSize, days) => {
            const pr = {
              diff_size: diffSize,
              review_status: 'APPROVED',
              ci_build_state: 'SUCCESS',
              branch_staleness_days: days,
              pr_id: 'test',
              repo: 'test',
              author: 'test',
            };

            const result = evaluatePR(pr);

            if (days <= 7) {
              expect(result.state).not.toBe('STALE_BRANCH');
            } else {
              expect(result.state).toBe('STALE_BRANCH');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
```

---

## Mocking Standards

### Network Request Mocking
```typescript
// Always mock fetch in tests
let originalFetch: typeof global.fetch;

beforeAll(() => {
  originalFetch = global.fetch;
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  jest.clearAllMocks();
});
```

### Environment Variable Mocking
```typescript
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});
```

### Assertion Styles
- Use `expect(value).toBe(expected)` for primitives
- Use `expect(obj).toMatchObject({ ... })` for partial object matching
- Use `expect(array).toContain(item)` for array membership
- Use `expect(promise).rejects.toThrow()` for error handling

### BAD (Non-compliant):
```typescript
// No cleanup
beforeAll(() => {
  global.fetch = mockFetch;
  // Missing afterAll cleanup
});

// Testing implementation details
expect(spy).toHaveBeenCalled();
```

### GOOD (Compliant):
```typescript
// Proper cleanup
afterAll(() => {
  global.fetch = originalFetch;
});

// Testing behavior, not implementation
expect(result.state).toBe('CI_BLOCKED');
expect(result.actionable_assignment.owner).toBe('Maintainer');
```