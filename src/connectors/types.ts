export type ConnectorId = 'slack' | 'discord' | 'telegram' | 'gmail';

export interface ConnectorField {
  key: string;
  label: string;
  secret: boolean;
}

export interface DigestConnector {
  id: ConnectorId;
  displayName: string;
  fields: ConnectorField[];
  send(digest: string, config: Record<string, string>): Promise<void>;
}
