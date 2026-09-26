import { ConnectorId, DigestConnector } from './types';
import { slackConnector } from './plugins/slack';
import { discordConnector } from './plugins/discord';
import { telegramConnector } from './plugins/telegram';
import { gmailConnector } from './plugins/gmail';

const connectors: DigestConnector[] = [slackConnector, discordConnector, telegramConnector, gmailConnector];

export function listConnectors(): DigestConnector[] {
  return connectors;
}

export function getConnector(id: string): DigestConnector | undefined {
  return connectors.find((connector) => connector.id === id);
}

export async function dispatchEnabled(
  rows: Array<{ plugin_id: string; enabled: boolean; config: Record<string, string> }>,
  digest: string,
  send: (connector: DigestConnector, config: Record<string, string>, digest: string) => Promise<void> = (connector, config, body) => connector.send(body, config)
): Promise<string[]> {
  const sent: string[] = [];
  for (const row of rows) {
    if (!row.enabled) {
      continue;
    }
    const connector = getConnector(row.plugin_id as ConnectorId);
    if (!connector) {
      continue;
    }
    await send(connector, row.config || {}, digest);
    sent.push(connector.id);
  }
  return sent;
}
