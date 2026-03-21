import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRepository } from '../../domain/user.repository.interface';
import { USER_CONSTANTS, USER_LANGUAGES } from '../../domain/user.entity';
import type { UserEntity } from '../../domain/user.entity';
import { PasswordHasher } from '../../../auth/domain/password-hasher.interface';
import { ROLES } from '../../../role/domain/role.types';

function isAtLeastMinimumAge(birthDate: Date, minimumAgeYears: number): boolean {
  const today = new Date();
  const minimumBirthDate = new Date(
    today.getFullYear() - minimumAgeYears,
    today.getMonth(),
    today.getDate(),
  );
  return birthDate <= minimumBirthDate;
}

export class CreateUserRequestDTO {
  static schema = z.object({
    name: z.string().min(USER_CONSTANTS.NAME_MIN_LENGTH).max(USER_CONSTANTS.NAME_MAX_LENGTH),
    email: z.string().email().max(USER_CONSTANTS.EMAIL_MAX_LENGTH),
    password: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
    role: z.enum(ROLES),
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

  @ApiProperty({ enum: ROLES, example: 'USER' })
  role!: string;

  @ApiPropertyOptional({ enum: USER_LANGUAGES, example: 'english' })
  language?: (typeof USER_LANGUAGES)[number];

  @ApiProperty({ example: '1995-06-15', format: 'date' })
  birthDate!: string;
}

export const CreateUserDTO = CreateUserRequestDTO.schema;

export type CreateUserInputDTO = z.infer<typeof CreateUserDTO>;

export class CreateUserUseCase {
  private readonly repo: UserRepository;
  private readonly hasher: PasswordHasher;

  constructor(repo: UserRepository, hasher: PasswordHasher) {
    this.repo = repo;
    this.hasher = hasher;
  }

  async execute(input: CreateUserInputDTO): Promise<UserEntity> {
    const passwordHash = await this.hasher.hash(input.password);
    return this.repo.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      language: input.language,
      birthDate: input.birthDate,
    });
  }
}
