import { Inject } from '@nestjs/common';
import { ResendClient, RESEND_CLIENT } from './resend.client';
import { loadEnv } from '../config/env';

export class EmailService {
  constructor(@Inject(RESEND_CLIENT) private readonly resend: ResendClient) {}

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const env = loadEnv();
    await this.resend.emails.send({
      from: env.RESEND_FROM,
      to,
      subject: 'Password Reset',
      text: `Use this token to reset your password: ${token}`,
    });
  }
}
