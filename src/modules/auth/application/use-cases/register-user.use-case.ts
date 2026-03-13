import { z } from 'zod';
import { ConflictException } from '@nestjs/common';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { PasswordHasher } from '../../domain/password-hasher.interface';
import { USER_CONSTANTS, USER_LANGUAGES, UserEntity } from '../../../user/domain/user.entity';
import { EventBus } from '../../../../common/messaging/event-bus.interface';
import { UserRegisteredEvent } from '../../../../common/messaging/events';

const USER_MINIMUM_AGE_YEARS = 16;

function isAtLeastMinimumAge(birthDate: Date, minimumAgeYears: number): boolean {
  const today = new Date();
  const minimumBirthDate = new Date(
    today.getFullYear() - minimumAgeYears,
    today.getMonth(),
    today.getDate(),
  );
  return birthDate <= minimumBirthDate;
}

export const RegisterUserDTO = z.object({
  name: z.string().min(USER_CONSTANTS.NAME_MIN_LENGTH).max(USER_CONSTANTS.NAME_MAX_LENGTH),
  email: z.string().email().max(USER_CONSTANTS.EMAIL_MAX_LENGTH),
  password: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
  language: z.enum(USER_LANGUAGES).optional().default(USER_CONSTANTS.LANGUAGE_DEFAULT),
  birthDate: z.coerce
    .date()
    .refine(
      (birthDate) => isAtLeastMinimumAge(birthDate, USER_MINIMUM_AGE_YEARS),
      `birthDate: must be at least ${USER_MINIMUM_AGE_YEARS} years old`,
    ),
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
  language: UserEntity['language'];
  birthDate: UserEntity['birthDate'];
};

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly events: EventBus,
  ) {}

  async execute(input: RegisterUserInputDTO): Promise<RegisterUserOutputDTO> {
    const exists = await this.users.existsByEmail(input.email.toLowerCase());
    if (exists) throw new ConflictException('Email already registered');
    const passwordHash = await this.hasher.hash(input.password);
    const entity = await this.users.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: USER_CONSTANTS.ROLE_DEFAULT,
      language: input.language,
      birthDate: input.birthDate,
    });
    const event: UserRegisteredEvent = {
      name: 'UserRegistered',
      payload: {
        userId: entity.uuid,
        email: entity.email,
        name: entity.name,
        language: entity.language,
      },
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
      language: entity.language,
      birthDate: entity.birthDate,
    };
  }
}
