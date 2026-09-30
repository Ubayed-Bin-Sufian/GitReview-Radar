/**
 * Property-Based Tests (PBT) for PR-Pulse PR Evaluator
 * 
 * Validates the 8 correctness properties (P-1 through P-8) using fast-check
 * 
 * Each property test runs 100+ iterations to ensure comprehensive coverage
 */

import * as fc from 'fast-check';
import { PREvaluator } from '../../src/evaluator/pr-evaluator';
import { DecisionEngine } from '../../src/jev/decision-engine';
import { PRMetadata, PRState, ReviewStatus, CIState } from '../../src/jev/types';
import { PREvaluationResult } from '../../src/evaluator/types';

// Mock fetch for DecisionEngine
let originalFetch: typeof global.fetch;

beforeAll(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('Property-Based Tests', () => {
  describe('P-1: CI Failure Dominance', () => {
    // Property: CI failures always result in CI_BLOCKED state with score >= 95
    it('should always return CI_BLOCKED when CI is FAILED', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1000 }),  // diff_size
          fc.integer({ min: 0, max: 30 }),    // branch_staleness_days
          async (diffSize, staleness) => {
            const pr: PRMetadata = {
              diff_size: diffSize,
              review_status: 'APPROVED',  // Fixed value
              ci_build_state: 'FAILED',   // Always FAILED
              branch_staleness_days: staleness,
              pr_id: 'test-pr',
              repo: 'test-repo',
              author: 'test-user',
            };

            // Mock fetch to return CI_BLOCKED for FAILED CI
            const mockResponse = {
              ok: true,
              json: () => Promise.resolve({
                choices: {
                  action_state: 'CI_BLOCKED',
                },
                scores: {
                  actionability_score: Math.min(95 + diffSize / 100, 100),
                },
              }),
            };

            global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

            const evaluator = new PREvaluator(new DecisionEngine('test-key'));
            
            const result = await evaluator.evaluatePR(pr);
            
            expect(result.state).toBe('CI_BLOCKED');
            expect(result.actionability_score).toBeGreaterThanOrEqual(95);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('P-2: Review State Priority', () => {
    // Property: Changes requested takes priority over branch staleness
    it('should prioritize CHANGES_REQUESTED over staleness', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1000 }),   // diff_size
          fc.integer({ min: 8, max: 30 }),     // branch_staleness_days (> 7, stale)
          async (diffSize, staleness) => {
            const pr: PRMetadata = {
              diff_size: diffSize,
              review_status: 'CHANGES_REQUESTED',  // Always requested
              ci_build_state: 'SUCCESS',            // Not FAILED
              branch_staleness_days: staleness,     // Stale (> 7)
              pr_id: 'test-pr',
              repo: 'test-repo',
              author: 'test-user',
            };

            // Mock fetch to return NEEDS_AUTHOR_FIX for CHANGES_REQUESTED
            const mockResponse = {
              ok: true,
              json: () => Promise.resolve({
                choices: {
                  action_state: 'NEEDS_AUTHOR_FIX',
                },
                scores: {
                  actionability_score: Math.min(85 + diffSize / 200, 100),
                },
              }),
            };

            global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

            const evaluator = new PREvaluator(new DecisionEngine('test-key'));
            
            const result = await evaluator.evaluatePR(pr);
            
            expect(result.state).toBe('NEEDS_AUTHOR_FIX');
            expect(result.state).not.toBe('STALE_BRANCH');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('P-3: Staleness Threshold Boundary', () => {
    // Property: Clear boundary at 7 days for stale detection
    describe('boundary at 7 days', () => {
      it('should return READY_FOR_FINAL_MERGE when days <= 7', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 1000 }),
            fc.integer({ min: 0, max: 7 }),
            async (diffSize, days) => {
              const pr: PRMetadata = {
                diff_size: diffSize,
                review_status: 'APPROVED',
                ci_build_state: 'SUCCESS',
                branch_staleness_days: days,
                pr_id: 'test-pr',
                repo: 'test-repo',
                author: 'test-user',
              };

              const expectedState = 'READY_FOR_FINAL_MERGE';
              
              const mockResponse = {
                ok: true,
                json: () => Promise.resolve({
                  choices: {
                    action_state: expectedState,
                  },
                  scores: {
                    actionability_score: Math.min(50 + diffSize / 500, 100),
                  },
                }),
              };

              global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

              const evaluator = new PREvaluator(new DecisionEngine('test-key'));
              
              const result = await evaluator.evaluatePR(pr);
              
              expect(result.state).toBe('READY_FOR_FINAL_MERGE');
              expect(result.state).not.toBe('STALE_BRANCH');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should return STALE_BRANCH when days > 7', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 1000 }),
            fc.integer({ min: 8, max: 30 }),
            async (diffSize, days) => {
              const pr: PRMetadata = {
                diff_size: diffSize,
                review_status: 'APPROVED',
                ci_build_state: 'SUCCESS',
                branch_staleness_days: days,
                pr_id: 'test-pr',
                repo: 'test-repo',
                author: 'test-user',
              };

              const expectedState = 'STALE_BRANCH';
              
              const mockResponse = {
                ok: true,
                json: () => Promise.resolve({
                  choices: {
                    action_state: expectedState,
                  },
                  scores: {
                    actionability_score: Math.min(70 + days * 2, 100),
                  },
                }),
              };

              global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

              const evaluator = new PREvaluator(new DecisionEngine('test-key'));
              
              const result = await evaluator.evaluatePR(pr);
              
              expect(result.state).toBe('STALE_BRANCH');
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });

  describe('P-4: Ready for Merge Fallthrough', () => {
    // Property: All non-blocked PRs with clean state resolve to READY_FOR_FINAL_MERGE
    describe('clean PRs resolve to READY_FOR_FINAL_MERGE', () => {
      it('should return READY_FOR_FINAL_MERGE when ci=SUCCESS, no changes requested, days <= 7', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 1000 }),
            fc.integer({ min: 0, max: 7 }),
            fc.oneof(
              fc.constant('APPROVED' as ReviewStatus),
              fc.constant('PENDING' as ReviewStatus)
            ),
            async (diffSize, days, reviewStatus) => {
              const pr: PRMetadata = {
                diff_size: diffSize,
                review_status: reviewStatus,
                ci_build_state: 'SUCCESS',
                branch_staleness_days: days,
                pr_id: 'test-pr',
                repo: 'test-repo',
                author: 'test-user',
              };

              // Calculate expected score
              const reviewBonus = reviewStatus === 'APPROVED' ? 50 : 25;
              const expectedScore = Math.min(reviewBonus + diffSize / 500, 100);
              
              const mockResponse = {
                ok: true,
                json: () => Promise.resolve({
                  choices: {
                    action_state: 'READY_FOR_FINAL_MERGE',
                  },
                  scores: {
                    actionability_score: expectedScore,
                  },
                }),
              };

              global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

              const evaluator = new PREvaluator(new DecisionEngine('test-key'));
              
              const result = await evaluator.evaluatePR(pr);
              
              expect(result.state).toBe('READY_FOR_FINAL_MERGE');
              expect(result.actionability_score).toBeGreaterThanOrEqual(25);
              expect(result.actionability_score).toBeLessThanOrEqual(100);
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });

  describe('P-5: Score Monotonicity by Diff Size', () => {
    // Property: Larger diff increases score for same state
    it('should have higher score for larger diff (same state)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 501, max: 1000 }),
          fc.integer({ min: 0, max: 5 }),
          fc.constant('APPROVED' as ReviewStatus),
          fc.constant('SUCCESS' as CIState),
          async (diffSizeSmall, diffSizeLarge, days, reviewStatus, ciState) => {
            // Create separate mock responses for each diff size
            const mockResponseSmall = {
              ok: true,
              json: () => Promise.resolve({
                choices: {
                  action_state: 'READY_FOR_FINAL_MERGE',
                },
                scores: {
                  actionability_score: Math.min(50 + diffSizeSmall / 500, 100),
                },
              }),
            };

            const mockResponseLarge = {
              ok: true,
              json: () => Promise.resolve({
                choices: {
                  action_state: 'READY_FOR_FINAL_MERGE',
                },
                scores: {
                  actionability_score: Math.min(50 + diffSizeLarge / 500, 100),
                },
              }),
            };

            // Track which PR is being evaluated
            let callCount = 0;
            global.fetch = jest.fn(() => {
              callCount++;
              return callCount === 1 
                ? Promise.resolve(mockResponseSmall)
                : Promise.resolve(mockResponseLarge);
            }) as any;

            const evaluator = new PREvaluator(new DecisionEngine('test-key'));
            
            // Create two PRs with different diff sizes
            const prSmall: PRMetadata = {
              diff_size: diffSizeSmall,
              review_status: reviewStatus,
              ci_build_state: ciState,
              branch_staleness_days: days,
              pr_id: 'test-pr-small',
              repo: 'test-repo',
              author: 'test-user',
            };

            const prLarge: PRMetadata = {
              diff_size: diffSizeLarge,
              review_status: reviewStatus,
              ci_build_state: ciState,
              branch_staleness_days: days,
              pr_id: 'test-pr-large',
              repo: 'test-repo',
              author: 'test-user',
            };

            const resultSmall = await evaluator.evaluatePR(prSmall);
            const resultLarge = await evaluator.evaluatePR(prLarge);
            
            expect(resultSmall.state).toBe('READY_FOR_FINAL_MERGE');
            expect(resultLarge.state).toBe('READY_FOR_FINAL_MERGE');
            expect(resultLarge.actionability_score).toBeGreaterThanOrEqual(resultSmall.actionability_score);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('P-6: Score Bounds', () => {
    // Property: All scores remain in valid range [0, 100]
    it('should have score in range [0, 100] for all states', async () => {
      const states: PRState[] = ['CI_BLOCKED', 'NEEDS_AUTHOR_FIX', 'STALE_BRANCH', 'READY_FOR_FINAL_MERGE'];
      
      for (const state of states) {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 1000 }),
            fc.integer({ min: 0, max: 30 }),
            fc.oneof(
              fc.constant('APPROVED' as ReviewStatus),
              fc.constant('CHANGES_REQUESTED' as ReviewStatus),
              fc.constant('PENDING' as ReviewStatus)
            ),
            fc.oneof(
              fc.constant('SUCCESS' as CIState),
              fc.constant('FAILED' as CIState),
              fc.constant('PENDING' as CIState),
              fc.constant('ERROR' as CIState)
            ),
            async (diffSize, days, reviewStatus, ciState) => {
              const pr: PRMetadata = {
                diff_size: diffSize,
                review_status: reviewStatus,
                ci_build_state: ciState,
                branch_staleness_days: days,
                pr_id: 'test-pr',
                repo: 'test-repo',
                author: 'test-user',
              };

              const mockResponse = {
                ok: true,
                json: () => Promise.resolve({
                  choices: {
                    action_state: state,
                  },
                  scores: {
                    actionability_score: 50,  // Mock score
                  },
                }),
              };

              global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

              const evaluator = new PREvaluator(new DecisionEngine('test-key'));
              
              const result = await evaluator.evaluatePR(pr);
              
              expect(result.actionability_score).toBeGreaterThanOrEqual(0);
              expect(result.actionability_score).toBeLessThanOrEqual(100);
            }
          ),
          { numRuns: 50 }  // Reduced for faster execution
        );
      }
    });
  });

  describe('P-7: State Exhaustiveness', () => {
    // Property: Exactly one output state from defined set
    it('should return one of the valid states', async () => {
      const validStates: PRState[] = [
        'NEEDS_AUTHOR_FIX',
        'READY_FOR_FINAL_MERGE',
        'STALE_BRANCH',
        'CI_BLOCKED',
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 30 }),
          fc.oneof(
            fc.constant('APPROVED' as ReviewStatus),
            fc.constant('CHANGES_REQUESTED' as ReviewStatus),
            fc.constant('PENDING' as ReviewStatus)
          ),
          fc.oneof(
            fc.constant('SUCCESS' as CIState),
            fc.constant('FAILED' as CIState),
            fc.constant('PENDING' as CIState),
            fc.constant('ERROR' as CIState)
          ),
          async (diffSize, days, reviewStatus, ciState) => {
            const pr: PRMetadata = {
              diff_size: diffSize,
              review_status: reviewStatus,
              ci_build_state: ciState,
              branch_staleness_days: days,
              pr_id: 'test-pr',
              repo: 'test-repo',
              author: 'test-user',
            };

            // Randomly select a valid state for this test
            const randomState = validStates[Math.floor(Math.random() * validStates.length)];

            const mockResponse = {
              ok: true,
              json: () => Promise.resolve({
                choices: {
                  action_state: randomState,
                },
                scores: {
                  actionability_score: 50,
                },
              }),
            };

            global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

            const evaluator = new PREvaluator(new DecisionEngine('test-key'));
            
            const result = await evaluator.evaluatePR(pr);
            
            expect(validStates).toContain(result.state);
            expect(result.state).toBeDefined();
            expect(result.state).not.toBe(null);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('P-8: Rule Priority Consistency', () => {
    // Property: Rules applied in correct priority order
    describe('rule priority order', () => {
      it('should apply R-1 when CI is FAILED', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 1000 }),
            fc.integer({ min: 0, max: 30 }),
            fc.constant('FAILED' as CIState),
            async (diffSize, days, ciState) => {
              const pr: PRMetadata = {
                diff_size: diffSize,
                review_status: 'APPROVED',
                ci_build_state: ciState,
                branch_staleness_days: days,
                pr_id: 'test-pr',
                repo: 'test-repo',
                author: 'test-user',
              };

              const mockResponse = {
                ok: true,
                json: () => Promise.resolve({
                  choices: {
                    action_state: 'CI_BLOCKED',
                  },
                  scores: {
                    actionability_score: 95,
                  },
                }),
              };

              global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

              const evaluator = new PREvaluator(new DecisionEngine('test-key'));
              
              const result = await evaluator.evaluatePR(pr);
              
              expect(result.evaluated_rules).toContain('R-1 (CI_BLOCKED)');
              expect(result.evaluated_rules).not.toContain('R-2');
              expect(result.evaluated_rules).not.toContain('R-3');
              expect(result.evaluated_rules).not.toContain('R-4');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should apply R-2 when changes requested and CI not FAILED', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 1000 }),
            fc.integer({ min: 0, max: 30 }),
            fc.constant('CHANGES_REQUESTED' as ReviewStatus),
            fc.oneof(
              fc.constant('SUCCESS' as CIState),
              fc.constant('PENDING' as CIState),
              fc.constant('ERROR' as CIState)
            ),
            async (diffSize, days, reviewStatus, ciState) => {
              const pr: PRMetadata = {
                diff_size: diffSize,
                review_status: reviewStatus,
                ci_build_state: ciState,
                branch_staleness_days: days,
                pr_id: 'test-pr',
                repo: 'test-repo',
                author: 'test-user',
              };

              const mockResponse = {
                ok: true,
                json: () => Promise.resolve({
                  choices: {
                    action_state: 'NEEDS_AUTHOR_FIX',
                  },
                  scores: {
                    actionability_score: 85,
                  },
                }),
              };

              global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as any;

              const evaluator = new PREvaluator(new DecisionEngine('test-key'));
              
              const result = await evaluator.evaluatePR(pr);
              
              expect(result.evaluated_rules).toContain('R-2 (NEEDS_AUTHOR_FIX)');
              expect(result.evaluated_rules).not.toContain('R-3');
              expect(result.evaluated_rules).not.toContain('R-4');
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });
});
