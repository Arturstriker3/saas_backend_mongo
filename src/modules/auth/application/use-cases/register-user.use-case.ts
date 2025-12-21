import { z } from 'zod';
import { ConflictException } from '@nestjs/common';
import { UserRepository } from '../../../user/domain/user.repository';
import { BcryptPasswordHasher } from '../../infrastructure/password-hasher.bcrypt';
import { USER_CONSTANTS } from '../../../user/domain/user.entity';

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
    private readonly hasher: BcryptPasswordHasher,
  ) {}

  async execute(input: RegisterUserInputDTO): Promise<RegisterUserOutputDTO> {
    const parsed = RegisterUserDTO.parse(input);
    const existing = await this.users.findByEmail(parsed.email.toLowerCase());
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await this.hasher.hash(parsed.password);
    const entity = await this.users.create({
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      role: USER_CONSTANTS.ROLE_DEFAULT,
      credits: USER_CONSTANTS.CREDITS_DEFAULT,
    });
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
