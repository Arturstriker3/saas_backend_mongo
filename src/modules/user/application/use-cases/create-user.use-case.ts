import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository.interface';
import {
  UserEntity,
  USER_CONSTANTS,
  USER_LANGUAGES,
} from '../../domain/user.entity';
import { PasswordHasher } from '../../../auth/domain/password-hasher.interface';
import { ROLES } from '../../../role/domain/role.types';

export const CreateUserDTO = z.object({
  name: z.string().min(USER_CONSTANTS.NAME_MIN_LENGTH).max(USER_CONSTANTS.NAME_MAX_LENGTH),
  email: z.string().email().max(USER_CONSTANTS.EMAIL_MAX_LENGTH),
  password: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
  role: z.enum(ROLES),
  language: z.enum(USER_LANGUAGES).default(USER_CONSTANTS.LANGUAGE_DEFAULT),
  birthDate: z.coerce.date().nullable().default(null),
});

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
