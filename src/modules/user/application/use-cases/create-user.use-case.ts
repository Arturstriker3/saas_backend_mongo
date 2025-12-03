import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository';
import { UserEntity, USER_CONSTANTS } from '../../domain/user.entity';
import { BcryptPasswordHasher } from '../../../auth/infrastructure/password-hasher.bcrypt';
import { ROLES } from '../../../role/domain/role.types';

export const CreateUserDTO = z.object({
  name: z.string().min(USER_CONSTANTS.NAME_MIN_LENGTH).max(USER_CONSTANTS.NAME_MAX_LENGTH),
  email: z.string().email().max(USER_CONSTANTS.EMAIL_MAX_LENGTH),
  password: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
  birthDate: z.coerce.date(),
  role: z.enum(ROLES),
  credits: z.number().min(USER_CONSTANTS.CREDITS_MIN).max(USER_CONSTANTS.CREDITS_MAX),
});

export type CreateUserInputDTO = z.infer<typeof CreateUserDTO>;

export class CreateUserUseCase {
  private readonly repo: UserRepository;
  private readonly hasher: BcryptPasswordHasher;

  constructor(repo: UserRepository, hasher: BcryptPasswordHasher) {
    this.repo = repo;
    this.hasher = hasher;
  }

  async execute(input: CreateUserInputDTO): Promise<UserEntity> {
    const parsed = CreateUserDTO.parse(input);
    const passwordHash = await this.hasher.hash(parsed.password);
    return this.repo.create({
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      birthDate: parsed.birthDate,
      role: parsed.role,
      credits: parsed.credits,
    });
  }
}
