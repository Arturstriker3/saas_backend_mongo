import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { PasswordResetRepository } from '../../domain/password-reset.repository.interface';
import { loadEnv } from '../../../../common/config/env';
import { randomBytes } from 'crypto';
import { v7 as uuidv7 } from 'uuid';
import { EventBus } from '../../../../common/messaging/event-bus.interface';
import { PasswordResetRequestedEvent } from '../../../../common/messaging/events';

export class RequestPasswordResetRequestDTO {
  static schema = z.object({ email: z.string().email() });

  @ApiProperty({ example: 'user@example.com' })
  email!: string;
}

export const RequestPasswordResetDTO = RequestPasswordResetRequestDTO.schema;
export type RequestPasswordResetInputDTO = z.infer<typeof RequestPasswordResetDTO>;

export class RequestPasswordResetUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly resets: PasswordResetRepository,
    private readonly events: EventBus,
  ) {}

  async execute(input: RequestPasswordResetInputDTO): Promise<boolean> {
    const user = await this.users.findByEmail(input.email.toLowerCase());
    if (!user) return true;
    const env = loadEnv();
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expires = new Date(now.getTime() + parseInt(env.PASSWORD_RESET_TTL, 10) * 1000);
    await this.resets.save({
      uuid: uuidv7(),
      token,
      userId: String(user.uuid),
      createdAt: now,
      expiresAt: expires,
    });
    const event: PasswordResetRequestedEvent = {
      name: 'PasswordResetRequested',
      payload: {
        email: user.email,
        token,
        language: user.language,
      },
      occurredAt: new Date(),
    };
    await this.events.publish(event);
    return true;
  }
}
