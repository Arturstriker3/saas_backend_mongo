import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { RoleEnum } from '../../../role/domain/role.types';
import { UserRepository } from '../../domain/user.repository.interface';

export class ToggleUserActiveParamsDTO {
  static schema = z.object({ uuid: z.string().min(1) });

  @ApiProperty({ example: 'f9f7f48e-1491-4de0-87e7-e3fd615f8026' })
  uuid!: string;
}

export const ToggleUserActiveDTO = ToggleUserActiveParamsDTO.schema;
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
