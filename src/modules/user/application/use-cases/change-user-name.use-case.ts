import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository.interface';

export const ChangeUserNameParamDTO = z.object({ uuid: z.string().min(1) });
export const ChangeUserNameBodyDTO = z.object({ name: z.string().min(3) });
export const ChangeUserNameDTO = ChangeUserNameParamDTO.merge(ChangeUserNameBodyDTO);
export type ChangeUserNameParamInputDTO = z.infer<typeof ChangeUserNameParamDTO>;
export type ChangeUserNameBodyInputDTO = z.infer<typeof ChangeUserNameBodyDTO>;
export type ChangeUserNameInputDTO = z.infer<typeof ChangeUserNameDTO>;

export class ChangeUserNameUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: ChangeUserNameInputDTO) {
    const user = await this.repo.findById(input.uuid);
    if (!user) throw new Error('User not found');
    const trimmed = input.name.trim();
    const updatedAt = new Date();
    await this.repo.updateNameById(input.uuid, trimmed, updatedAt);
    return { ...user, name: trimmed, updatedAt };
  }
}
