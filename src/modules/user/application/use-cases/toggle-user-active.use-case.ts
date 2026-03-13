import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { RoleEnum } from '../../../role/domain/role.types';
import { UserRepository } from '../../domain/user.repository.interface';

export const ToggleUserActiveDTO = z.object({ uuid: z.string().min(1) });
export type ToggleUserActiveInputDTO = z.infer<typeof ToggleUserActiveDTO>;

export class ToggleUserActiveUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: ToggleUserActiveInputDTO) {
    const user = await this.repo.findById(input.uuid);
    if (!user) throw new NotFoundException('User not found');
    const nextIsActive = !user.isActive;
    if (!nextIsActive && user.role === RoleEnum.ADMIN)
      throw new ForbiddenException('Admin accounts cannot be deactivated');
    const updatedAt = new Date();
    await this.repo.updateActiveById(input.uuid, nextIsActive, updatedAt);
    return { ...user, isActive: nextIsActive, updatedAt };
  }
}
