import { Inject } from '@nestjs/common';
import { ResendClient, RESEND_CLIENT } from './resend.client';
import { loadEnv } from '../config/env';

export class EmailService {
  constructor(@Inject(RESEND_CLIENT) private readonly resend: ResendClient) {}

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const env = loadEnv();
    try {
      await this.resend.emails.send({
        from: env.RESEND_FROM,
        to,
        subject: 'Password Reset',
        text: `Use this token to reset your password: ${token}`,
      });
    } catch (err: unknown) {
      const name = (err as any)?.name as string | undefined;
      if (name === 'validation_error') return;
      throw err;
    }
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    const env = loadEnv();
    try {
      await this.resend.emails.send({
        from: env.RESEND_FROM,
        to,
        subject: `Welcome to ${env.APP_NAME}`,
        text: `
        Hi ${name},

        Welcome aboard! Your account has been successfully created.

        You’re all set to start using the platform.
        If you need any assistance, just let us know — we’ll be happy to help.

        Best regards,
        The Team
        `,
      });
    } catch (err: unknown) {
      const nameValue = (err as any)?.name as string | undefined;
      if (nameValue === 'validation_error') return;
      throw err;
    }
  }

  async sendOrderConfirmation(to: string, orderId: string): Promise<void> {
    const env = loadEnv();
    try {
      await this.resend.emails.send({
        from: env.RESEND_FROM,
        to,
        subject: 'Order Confirmation',
        text: `Order confirmed: ${orderId}`,
      });
    } catch (err: unknown) {
      const nameValue = (err as any)?.name as string | undefined;
      if (nameValue === 'validation_error') return;
      throw err;
    }
  }
}
