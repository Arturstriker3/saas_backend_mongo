import { z } from "zod";
import { PasswordResetRepository } from "../../domain/password-reset.repository";
import { UserRepository } from "../../../user/domain/user.repository";
import { BcryptPasswordHasher } from "../../infrastructure/password-hasher.bcrypt";

export const ConfirmPasswordResetDTO = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ConfirmPasswordResetInputDTO = z.infer<typeof ConfirmPasswordResetDTO>;

export class ConfirmPasswordResetUseCase {
  constructor(
    private readonly resets: PasswordResetRepository,
    private readonly users: UserRepository,
    private readonly hasher: BcryptPasswordHasher
  ) {}

  async execute(input: ConfirmPasswordResetInputDTO) {
    const { token, newPassword } = ConfirmPasswordResetDTO.parse(input);
    const record = await this.resets.findByToken(token);
    if (!record) throw new Error("Invalid reset token");
    if (record.expiresAt.getTime() <= Date.now()) throw new Error("Reset token expired");
    const user = await this.users.findById(record.userId);
    if (!user) throw new Error("User not found");
    const hash = await this.hasher.hash(newPassword);
    user.changePassword(hash);
    await this.users.save(user);
    await this.resets.deleteByToken(token);
    return user;
  }
}

