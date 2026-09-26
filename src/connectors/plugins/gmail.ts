import nodemailer from 'nodemailer';
import { DigestConnector } from '../types';

export const gmailConnector: DigestConnector = {
  id: 'gmail',
  displayName: 'Gmail',
  fields: [
    { key: 'smtp_user', label: 'Gmail address', secret: false },
    { key: 'smtp_pass', label: 'App password', secret: true },
    { key: 'to', label: 'Send digest to', secret: false },
  ],
  async send(digest, config) {
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: config.smtp_user, pass: config.smtp_pass },
    });
    await transport.sendMail({
      from: config.smtp_user,
      to: config.to,
      subject: 'PR-Pulse daily summary',
      text: digest,
    });
  },
};
