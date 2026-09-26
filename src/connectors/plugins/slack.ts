import { DigestConnector } from '../types';

export const slackConnector: DigestConnector = {
  id: 'slack',
  displayName: 'Slack',
  fields: [{ key: 'webhook_url', label: 'Incoming webhook URL', secret: true }],
  async send(digest, config) {
    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: digest }),
    });
    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }
  },
};
