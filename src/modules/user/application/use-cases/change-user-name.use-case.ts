import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository';

export const ChangeUserNameDTO = z.object({ uuid: z.string().min(1), name: z.string().min(3) });
export type ChangeUserNameInputDTO = z.infer<typeof ChangeUserNameDTO>;

export class ChangeUserNameUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: ChangeUserNameInputDTO) {
    const { uuid, name } = ChangeUserNameDTO.parse(input);
    const user = await this.repo.findById(uuid);
    if (!user) throw new Error('User not found');
    user.changeName(name);
    await this.repo.save(user);
    return user;
  }
}
