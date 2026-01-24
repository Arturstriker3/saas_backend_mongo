import { Provider } from '@nestjs/common';
import { connect, ChannelModel } from 'amqplib';
import { loadEnv } from '../config/env';

export const RABBITMQ_CONNECTION = 'RABBITMQ_CONNECTION';
export type RabbitMQConnection = ChannelModel;

export const rabbitmqConnectionProvider: Provider = {
  provide: RABBITMQ_CONNECTION,
  useFactory: async (): Promise<RabbitMQConnection> => {
    const env = loadEnv();
    return connect(env.RABBITMQ_URL);
  },
};
