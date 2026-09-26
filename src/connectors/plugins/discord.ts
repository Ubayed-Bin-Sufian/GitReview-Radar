import { DigestConnector } from '../types';

export const discordConnector: DigestConnector = {
  id: 'discord',
  displayName: 'Discord',
  fields: [{ key: 'webhook_url', label: 'Webhook URL', secret: true }],
  async send(digest, config) {
    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: digest.slice(0, 1900) }),
    });
    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status}`);
    }
  },
};
