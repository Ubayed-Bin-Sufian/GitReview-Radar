import { DigestConnector } from '../types';

export const telegramConnector: DigestConnector = {
  id: 'telegram',
  displayName: 'Telegram',
  fields: [
    { key: 'bot_token', label: 'Bot token', secret: true },
    { key: 'chat_id', label: 'Chat id', secret: false },
  ],
  async send(digest, config) {
    const response = await fetch(`https://api.telegram.org/bot${config.bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chat_id, text: digest.slice(0, 4000) }),
    });
    if (!response.ok) {
      throw new Error(`Telegram send failed: ${response.status}`);
    }
  },
};
