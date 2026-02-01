import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository.interface';

export const ActivateUserDTO = z.object({ uuid: z.string().min(1) });
export type ActivateUserInputDTO = z.infer<typeof ActivateUserDTO>;

export class ActivateUserUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: ActivateUserInputDTO) {
    const { uuid } = ActivateUserDTO.parse(input);
    const user = await this.repo.findById(uuid);
    if (!user) throw new Error('User not found');
    if (user.isActive) return user;
    const updatedAt = new Date();
    await this.repo.updateActiveById(uuid, true, updatedAt);
    return { ...user, isActive: true, updatedAt };
  }
}
