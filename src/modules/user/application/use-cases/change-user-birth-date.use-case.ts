import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import { UserRepository } from '../../domain/user.repository.interface';

export class ChangeUserBirthDateRequestDTO {
  static schema = z.object({ birthDate: z.string().min(1) });

  @ApiProperty({ example: '1995-06-15', format: 'date' })
  birthDate!: string;
}

export const ChangeUserBirthDateBodyDTO = ChangeUserBirthDateRequestDTO.schema;
export type ChangeUserBirthDateBodyInputDTO = z.infer<typeof ChangeUserBirthDateBodyDTO>;

export class ChangeUserBirthDateUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(userId: string, input: ChangeUserBirthDateBodyInputDTO) {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const birthDate = new Date(input.birthDate);
    const updatedAt = new Date();
    await this.repo.updateBirthDateById(userId, birthDate, updatedAt);
    return { ...user, birthDate, updatedAt };
  }
}
