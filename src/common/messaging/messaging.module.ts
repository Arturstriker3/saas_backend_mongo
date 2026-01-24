import { Module } from '@nestjs/common';
import { EVENT_BUS } from './event-bus.interface';
import { rabbitmqConnectionProvider } from './rabbitmq.connection';
import { RabbitMQEventBus } from './rabbitmq.event-bus';

@Module({
  providers: [rabbitmqConnectionProvider, RabbitMQEventBus, { provide: EVENT_BUS, useExisting: RabbitMQEventBus }],
  exports: [EVENT_BUS, rabbitmqConnectionProvider],
})
export class MessagingModule {}
