import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository.interface';
import { RoleEnum } from '../../../role/domain/role.types';

export const DeactivateUserDTO = z.object({ userId: z.string().min(1) });
export type DeactivateUserInputDTO = z.infer<typeof DeactivateUserDTO>;

export class DeactivateUserUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: DeactivateUserInputDTO) {
    const user = await this.repo.findById(input.userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === RoleEnum.ADMIN)
      throw new ForbiddenException('Admin accounts cannot be deactivated');
    if (!user.isActive) return user;
    const updatedAt = new Date();
    await this.repo.updateActiveById(input.userId, false, updatedAt);
    return { ...user, isActive: false, updatedAt };
  }
}
