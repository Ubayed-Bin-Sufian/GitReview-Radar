/**
 * API Gateway POST /evaluate Lambda Handler
 * Evaluates a single PR and returns actionability state with Next-Step Owner assignment
 */

import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PREvaluator } from '../evaluator';
import { DecisionEngine } from '../jev';
import { validatePRMetadata, PRMetadata } from '../jev/types';
import { getConfig } from '../config';
import { ApiError, handleApiError } from '../errors';

// Initialize evaluator with config
let evaluator: PREvaluator | null = null;

/**
 * Initialize the evaluator with config (singleton pattern for Lambda cold start optimization)
 */
function getEvaluator(): PREvaluator {
  if (!evaluator) {
    const config = getConfig();
    evaluator = new PREvaluator(new DecisionEngine(config.jevApiKey));
  }
  return evaluator;
}

/**
 * Handler for POST /evaluate endpoint
 * Validates input, evaluates PR, returns response with proper error handling
 */
export async function evaluateHandler(
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');

    // Validate PR metadata
    const prMetadata = validatePRMetadata(body);

    // Get evaluator instance
    const evalInstance = getEvaluator();

    // Evaluate PR
    const result = await evalInstance.evaluatePR(prMetadata);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-PR-Pulse-Version': '1.0.0',
      },
      body: JSON.stringify(result, null, 2),
    };
  } catch (error) {
    return handleApiError(error);
  }
}