import { dispatchEnabled } from '../../src/connectors/registry';
import { DigestConnector } from '../../src/connectors/types';

describe('dispatchEnabled', () => {
  it('sends only through enabled connectors', async () => {
    const sent: string[] = [];
    const send = async (connector: DigestConnector) => {
      sent.push(connector.id);
    };

    const ids = await dispatchEnabled(
      [
        { plugin_id: 'slack', enabled: true, config: { webhook_url: 'https://example.test' } },
        { plugin_id: 'discord', enabled: false, config: { webhook_url: 'https://example.test' } },
        { plugin_id: 'telegram', enabled: true, config: { bot_token: 't', chat_id: '1' } },
      ],
      'digest',
      send
    );

    expect(ids).toEqual(['slack', 'telegram']);
    expect(sent).toEqual(['slack', 'telegram']);
  });
});
