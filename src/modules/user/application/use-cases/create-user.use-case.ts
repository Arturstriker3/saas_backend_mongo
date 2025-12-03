import { z } from "zod";
import { UserRepository } from "../../domain/user.repository";
import { UserEntity, USER_CONSTANTS } from "../../domain/user.entity";
import { ROLES } from "../../../role/domain/role.types";

export const CreateUserDTO = z.object({
  name: z.string().min(USER_CONSTANTS.NAME_MIN_LENGTH),
  email: z.string().email(),
  passwordHash: z.string().min(USER_CONSTANTS.PASSWORD_HASH_MIN_LENGTH),
  birthDate: z.coerce.date(),
  role: z.enum(ROLES),
  credits: z.number().min(USER_CONSTANTS.CREDITS_MIN),
});

export type CreateUserInputDTO = z.infer<typeof CreateUserDTO>;

export class CreateUserUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: CreateUserInputDTO): Promise<UserEntity> {
    const parsed = CreateUserDTO.parse(input);
    return this.repo.create(parsed);
  }
}
