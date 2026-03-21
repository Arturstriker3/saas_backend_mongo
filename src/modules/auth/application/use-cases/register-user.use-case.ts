import { z } from 'zod';
import { ConflictException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { PasswordHasher } from '../../domain/password-hasher.interface';
import { USER_CONSTANTS, USER_LANGUAGES } from '../../../user/domain/user.entity';
import type { UserEntity } from '../../../user/domain/user.entity';
import { EventBus } from '../../../../common/messaging/event-bus.interface';
import { UserRegisteredEvent } from '../../../../common/messaging/events';

function isAtLeastMinimumAge(birthDate: Date, minimumAgeYears: number): boolean {
  const today = new Date();
  const minimumBirthDate = new Date(
    today.getFullYear() - minimumAgeYears,
    today.getMonth(),
    today.getDate(),
  );
  return birthDate <= minimumBirthDate;
}

export class RegisterUserRequestDTO {
  static schema = z.object({
    name: z.string().min(USER_CONSTANTS.NAME_MIN_LENGTH).max(USER_CONSTANTS.NAME_MAX_LENGTH),
    email: z.string().email().max(USER_CONSTANTS.EMAIL_MAX_LENGTH),
    password: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
    language: z.enum(USER_LANGUAGES).optional().default(USER_CONSTANTS.LANGUAGE_DEFAULT),
    birthDate: z.coerce
      .date()
      .refine(
        (birthDate) => isAtLeastMinimumAge(birthDate, USER_CONSTANTS.MINIMUM_AGE_YEARS),
        `birthDate: must be at least ${USER_CONSTANTS.MINIMUM_AGE_YEARS} years old`,
      ),
  });

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email!: string;

  @ApiProperty({ example: 'password123' })
  password!: string;

  @ApiPropertyOptional({ enum: USER_LANGUAGES, example: 'english' })
  language?: (typeof USER_LANGUAGES)[number];

  @ApiProperty({ example: '1995-06-15', format: 'date' })
  birthDate!: string;
}

export const RegisterUserDTO = RegisterUserRequestDTO.schema;

export type RegisterUserInputDTO = z.infer<typeof RegisterUserDTO>;

export class RegisterUserResponseDTO {
  @ApiProperty({ example: 'f9f7f48e-1491-4de0-87e7-e3fd615f8026' })
  uuid!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 'USER' })
  role!: string;

  @ApiProperty({ enum: USER_LANGUAGES, example: 'english' })
  language!: (typeof USER_LANGUAGES)[number];

  @ApiProperty({ format: 'date-time', nullable: true })
  birthDate!: UserEntity['birthDate'];
}

export type RegisterUserOutputDTO = RegisterUserResponseDTO;

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
