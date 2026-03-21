import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import { UserRepository } from '../../domain/user.repository.interface';

export class ActivateUserParamsDTO {
  static schema = z.object({ uuid: z.string().min(1) });

  @ApiProperty({ example: 'f9f7f48e-1491-4de0-87e7-e3fd615f8026' })
  uuid!: string;
}

export const ActivateUserDTO = ActivateUserParamsDTO.schema;
export type ActivateUserInputDTO = z.infer<typeof ActivateUserDTO>;

export class ActivateUserUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: ActivateUserInputDTO) {
    const user = await this.repo.findById(input.uuid);
    if (!user) throw new Error('User not found');
    if (user.isActive) return user;
    const updatedAt = new Date();
    await this.repo.updateActiveById(input.uuid, true, updatedAt);
    return { ...user, isActive: true, updatedAt };
  }
}
