import { Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Channel, ConsumeMessage } from 'amqplib';
import { loadEnv } from '../config/env';
import { EmailService } from './email.service';
import { RabbitMQConnection, RABBITMQ_CONNECTION } from '../messaging/rabbitmq.connection';
import { DomainEvent } from '../messaging/events';

export class EmailConsumers implements OnModuleInit, OnModuleDestroy {
  private channel: Channel | null = null;

  constructor(
    @Inject(RABBITMQ_CONNECTION) private readonly conn: RabbitMQConnection,
    private readonly email: EmailService,
  ) {}

  async onModuleInit(): Promise<void> {
    const env = loadEnv();
    const channel = await this.conn.createChannel();
    await channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });

    await this.setupConsumer(channel, 'email.welcome', async (event) => {
      if (event.name !== 'UserRegistered') return;
      if (env.EMAIL_WELCOME_ENABLED !== 'true') return;
      await this.email.sendWelcome(event.payload.email, event.payload.name, event.payload.language);
    });

    await this.setupConsumer(channel, 'email.password_reset', async (event) => {
      if (event.name !== 'PasswordResetRequested') return;
      await this.email.sendPasswordReset(
        event.payload.email,
        event.payload.token,
        event.payload.language,
      );
    });

    await this.setupConsumer(channel, 'email.order_confirmation', async (event) => {
      if (event.name !== 'OrderConfirmed') return;
      if (env.EMAIL_ORDER_CONFIRMATION_ENABLED !== 'true') return;
      await this.email.sendOrderConfirmation(
        event.payload.email,
        event.payload.orderId,
        event.payload.language,
      );
    });

    this.channel = channel;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel) await this.channel.close();
    await this.conn.close();
  }

  private async setupConsumer(
    channel: Channel,
    queueName: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    const env = loadEnv();
    await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queueName, env.RABBITMQ_EXCHANGE, queueName);
    await channel.consume(queueName, async (msg) => this.handleMessage(channel, msg, handler));
  }

  private async handleMessage(
    channel: Channel,
    msg: ConsumeMessage | null,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString()) as DomainEvent;
      await handler(event);
      channel.ack(msg);
    } catch {
      channel.nack(msg, false, false);
    }
  }
}
