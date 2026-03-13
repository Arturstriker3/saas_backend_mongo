import { Inject } from '@nestjs/common';
import { ResendClient, RESEND_CLIENT } from './resend.client';
import { loadEnv } from '../config/env';
import { EmailLanguage } from '../messaging/events';

export class EmailService {
  constructor(@Inject(RESEND_CLIENT) private readonly resend: ResendClient) {}

  async sendPasswordReset(to: string, token: string, language: EmailLanguage): Promise<void> {
    const env = loadEnv();
    const content = this.getPasswordResetContent(token, language, env.APP_NAME);
    await this.sendEmail(env.RESEND_FROM, to, content.subject, content.text);
  }

  async sendWelcome(to: string, name: string, language: EmailLanguage): Promise<void> {
    const env = loadEnv();
    const content = this.getWelcomeContent(name, language, env.APP_NAME);
    await this.sendEmail(env.RESEND_FROM, to, content.subject, content.text);
  }

  async sendOrderConfirmation(to: string, orderId: string, language: EmailLanguage): Promise<void> {
    const env = loadEnv();
    const content = this.getOrderConfirmationContent(orderId, language);
    await this.sendEmail(env.RESEND_FROM, to, content.subject, content.text);
  }

  private async sendEmail(from: string, to: string, subject: string, text: string): Promise<void> {
    try {
      await this.resend.emails.send({
        from,
        to,
        subject,
        text,
      });
    } catch (err: unknown) {
      const name = (err as any)?.name as string | undefined;
      if (name === 'validation_error') return;
      throw err;
    }
  }

  private getPasswordResetContent(
    token: string,
    language: EmailLanguage,
    appName: string,
  ): { subject: string; text: string } {
    if (language === 'portuguese') {
      return {
        subject: `${appName} Redefinição de Senha`,
        text: `
          Você solicitou a redefinição da sua senha.

          Use o link abaixo para continuar:
          ${token}

          Se você não fez essa solicitação, pode ignorar este email.
        `,
      };
    }

    if (language === 'spanish') {
      return {
        subject: `${appName} Restablecimiento de Contraseña`,
        text: `
          Has solicitado restablecer tu contraseña.

          Usa el siguiente enlace para continuar:
          ${token}

          Si no realizaste esta solicitud, puedes ignorar este correo.
        `,
      };
    }

    return {
      subject: `${appName} Password Reset`,
      text: `
        You requested to reset your password.

        Use the link below to continue:
        ${token}

        If you didn’t request this, you can safely ignore this email.
      `,
    };
  }

  private getWelcomeContent(
    name: string,
    language: EmailLanguage,
    appName: string,
  ): { subject: string; text: string } {
    if (language === 'portuguese') {
      return {
        subject: `Bem-vindo ao ${appName}`,
        text: `
          Olá ${name},

          Seja bem-vindo! Sua conta foi criada com sucesso.

          Agora você já pode começar a usar a plataforma.
          Se precisar de ajuda, conte com a gente.

          Atenciosamente,
          Time de Suporte
        `,
      };
    }

    if (language === 'spanish') {
      return {
        subject: `Bienvenido a ${appName}`,
        text: `
          Hola ${name},

          ¡Bienvenido! Tu cuenta se creó correctamente.

          Ya puedes comenzar a usar la plataforma.
          Si necesitas ayuda, cuenta con nosotros.

          Saludos,
          Equipo de Soporte
        `,
      };
    }

    return {
      subject: `Welcome to ${appName}`,
      text: `
        Hi ${name},

        Welcome aboard! Your account has been successfully created.

        You’re all set to start using the platform.
        If you need any assistance, just let us know — we’ll be happy to help.

        Best regards,
        The Team
      `,
    };
  }

  private getOrderConfirmationContent(
    orderId: string,
    language: EmailLanguage,
  ): { subject: string; text: string } {
    if (language === 'portuguese') {
      return {
        subject: 'Confirmação de Pedido',
        text: `Pedido confirmado: ${orderId}`,
      };
    }

    if (language === 'spanish') {
      return {
        subject: 'Confirmación de Pedido',
        text: `Pedido confirmado: ${orderId}`,
      };
    }

    return {
      subject: 'Order Confirmation',
      text: `Order confirmed: ${orderId}`,
    };
  }
}
