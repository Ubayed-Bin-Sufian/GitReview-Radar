/**
 * EventBridge Scheduled CRON Lambda Handler
 * Generates daily digest and sends to webhook
 */

import { EventBridgeEvent } from 'aws-lambda';
import { PREvaluator } from '../evaluator';
import { DecisionEngine } from '../jev';
import { DigestBuilder } from '../digest';
import { getConfig, Config } from '../config';
import { PREvaluationResult } from '../evaluator/types';
import { PRMetadata } from '../jev/types';

// Initialize components with config
let evaluator: PREvaluator | null = null;
let digestBuilder: DigestBuilder | null = null;

/**
 * Initialize evaluator with config (singleton pattern for Lambda cold start)
 */
function getEvaluator(config: Config): PREvaluator {
  if (!evaluator) {
    evaluator = new PREvaluator(new DecisionEngine(config.jevApiKey));
  }
  return evaluator;
}

/**
 * Initialize digest builder (singleton pattern for Lambda cold start)
 */
function getDigestBuilder(): DigestBuilder {
  if (!digestBuilder) {
    digestBuilder = new DigestBuilder({
      maxTopPriorities: 10,
      includeStaleThreshold: 7,
      includeCiBlocked: true,
    });
  }
  return digestBuilder;
}

/**
 * Handler for daily digest generation (EventBridge cron trigger)
 */
export async function digestHandler(
  event: EventBridgeEvent<'ScheduledEvent', void>
): Promise<void> {
  const config = getConfig();

  try {
    // Get evaluator and digest builder
    const evalInstance = getEvaluator(config);
    const builder = getDigestBuilder();

    // Get PRs from DynamoDB (implemented elsewhere)
    const pendingPRs: PRMetadata[] = await getPendingPRs(config.databaseTableName);

    if (pendingPRs.length === 0) {
      console.log('No pending PRs to evaluate');
      return;
    }

    // Batch evaluate PRs
    console.log(`Evaluating ${pendingPRs.length} pending PRs...`);
    const results = await evalInstance.evaluateBatch(pendingPRs);

    // Build digest output
    const digestOutput = builder.buildDigestOutput(results);

    // Send to webhook (if configured)
    if (config.digestWebhookUrl) {
      await sendToWebhook(config.digestWebhookUrl, digestOutput);
      console.log('Digest sent to webhook successfully');
    } else {
      console.log('No webhook URL configured. Digest output:');
      console.log(digestOutput.markdown);
    }
  } catch (error) {
    console.error('Digest generation failed:', error);
    throw error;
  }
}

/**
 * Get pending PRs from database (placeholder implementation)
 */
async function getPendingPRs(tableName: string): Promise<PRMetadata[]> {
  return [];
}

/**
 * Send digest to webhook URL
 */
async function sendToWebhook(url: string, digestOutput: { markdown: string; json: string }): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PR-Pulse-Version': '1.0.0',
    },
    body: digestOutput.json,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Webhook delivery failed: ${response.status} ${errorText}`);
  }
}

// Export handler for AWS Lambda
export default digestHandler;