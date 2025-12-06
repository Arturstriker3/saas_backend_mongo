import { z } from 'zod';
import { UserRepository } from '../../../user/domain/user.repository';
import { BcryptPasswordHasher } from '../../infrastructure/password-hasher.bcrypt';
import { UserEntity, USER_CONSTANTS } from '../../../user/domain/user.entity';

export const RegisterUserDTO = z.object({
  name: z.string().min(USER_CONSTANTS.NAME_MIN_LENGTH).max(USER_CONSTANTS.NAME_MAX_LENGTH),
  email: z.string().email().max(USER_CONSTANTS.EMAIL_MAX_LENGTH),
  password: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
  birthDate: z.coerce.date(),
});

export type RegisterUserInputDTO = z.infer<typeof RegisterUserDTO>;

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: BcryptPasswordHasher,
  ) {}

  async execute(input: RegisterUserInputDTO): Promise<UserEntity> {
    const parsed = RegisterUserDTO.parse(input);
    const existing = await this.users.findByEmail(parsed.email.toLowerCase());
    if (existing) throw new Error('Email already registered');
    const passwordHash = await this.hasher.hash(parsed.password);
    const entity = await this.users.create({
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      birthDate: parsed.birthDate,
      role: USER_CONSTANTS.ROLE_DEFAULT,
      credits: USER_CONSTANTS.CREDITS_DEFAULT,
    });
    return entity;
  }
}
