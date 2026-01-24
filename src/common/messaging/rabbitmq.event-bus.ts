import { Inject } from '@nestjs/common';
import { Channel } from 'amqplib';
import { loadEnv } from '../config/env';
import { EventBus } from './event-bus.interface';
import { DomainEvent } from './events';
import { RabbitMQConnection, RABBITMQ_CONNECTION } from './rabbitmq.connection';

export class RabbitMQEventBus implements EventBus {
  private channel: Channel | null = null;

  constructor(@Inject(RABBITMQ_CONNECTION) private readonly conn: RabbitMQConnection) {}

  async publish(event: DomainEvent): Promise<void> {
    const channel = await this.getChannel();
    const env = loadEnv();
    const routingKey = this.getRoutingKey(event);
    const payload = Buffer.from(JSON.stringify(event));
    channel.publish(env.RABBITMQ_EXCHANGE, routingKey, payload, { persistent: true });
  }

  private async getChannel(): Promise<Channel> {
    if (this.channel) return this.channel;
    const env = loadEnv();
    const channel = await this.conn.createChannel();
    await channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
    this.channel = channel;
    return channel;
  }

  private getRoutingKey(event: DomainEvent): string {
    if (event.name === 'UserRegistered') return 'email.welcome';
    if (event.name === 'PasswordResetRequested') return 'email.password_reset';
    if (event.name === 'OrderConfirmed') return 'email.order_confirmation';
    return 'unknown';
  }
}
