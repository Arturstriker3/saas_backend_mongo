import { z } from "zod";
import { UserRepository } from "../../../user/domain/user.repository";
import { PasswordResetRepository } from "../../domain/password-reset.repository";
import { EmailService } from "../../../../common/email/email.service";
import { loadEnv } from "../../../../common/config/env";
import { randomBytes } from "crypto";

export const RequestPasswordResetDTO = z.object({ email: z.string().email() });
export type RequestPasswordResetInputDTO = z.infer<
  typeof RequestPasswordResetDTO
>;

export class RequestPasswordResetUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly resets: PasswordResetRepository,
    private readonly email: EmailService
  ) {}

  async execute(input: RequestPasswordResetInputDTO): Promise<boolean> {
    const { email } = RequestPasswordResetDTO.parse(input);
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user) return true;
    const env = loadEnv();
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expires = new Date(
      now.getTime() + parseInt(env.PASSWORD_RESET_TTL, 10) * 1000
    );
    await this.resets.save({
      token,
      userId: String(user.id),
      createdAt: now,
      expiresAt: expires,
    });
    await this.email.sendPasswordReset(user.email, token);
    return true;
  }
}
