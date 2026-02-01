import { z } from 'zod';
import { ConflictException } from '@nestjs/common';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { PasswordHasher } from '../../domain/password-hasher.interface';
import { USER_CONSTANTS } from '../../../user/domain/user.entity';
import { EventBus } from '../../../../common/messaging/event-bus.interface';
import { UserRegisteredEvent } from '../../../../common/messaging/events';

export const RegisterUserDTO = z.object({
  name: z.string().min(USER_CONSTANTS.NAME_MIN_LENGTH).max(USER_CONSTANTS.NAME_MAX_LENGTH),
  email: z.string().email().max(USER_CONSTANTS.EMAIL_MAX_LENGTH),
  password: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
});

export type RegisterUserInputDTO = z.infer<typeof RegisterUserDTO>;

export type RegisterUserOutputDTO = {
  uuid: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  role: string;
  credits: number;
};

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly events: EventBus,
  ) {}

  async execute(input: RegisterUserInputDTO): Promise<RegisterUserOutputDTO> {
    const parsed = RegisterUserDTO.parse(input);
    const exists = await this.users.existsByEmail(parsed.email.toLowerCase());
    if (exists) throw new ConflictException('Email already registered');
    const passwordHash = await this.hasher.hash(parsed.password);
    const entity = await this.users.create({
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      role: USER_CONSTANTS.ROLE_DEFAULT,
      credits: USER_CONSTANTS.CREDITS_DEFAULT,
    });
    const event: UserRegisteredEvent = {
      name: 'UserRegistered',
      payload: { userId: entity.uuid, email: entity.email, name: entity.name },
      occurredAt: new Date(),
    };
    await this.events.publish(event);
    return {
      uuid: entity.uuid,
      name: entity.name,
      email: entity.email,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      isActive: entity.isActive,
      role: entity.role,
      credits: entity.credits,
    };
  }
}
