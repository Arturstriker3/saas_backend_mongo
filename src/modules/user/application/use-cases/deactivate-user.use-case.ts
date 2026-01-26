import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository.interface';

export const DeactivateUserDTO = z.object({ uuid: z.string().min(1) });
export type DeactivateUserInputDTO = z.infer<typeof DeactivateUserDTO>;

export class DeactivateUserUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: DeactivateUserInputDTO) {
    const { uuid } = DeactivateUserDTO.parse(input);
    const user = await this.repo.findById(uuid);
    if (!user) throw new Error('User not found');
    if (!user.isActive) return user;
    const updatedAt = new Date();
    await this.repo.updateActiveById(uuid, false, updatedAt);
    return { ...user, isActive: false, updatedAt };
  }
}
