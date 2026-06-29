import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import { USER_LANGUAGES, type UserLanguage } from '../../domain/user.entity';
import { UserRepository } from '../../domain/user.repository.interface';

export class ChangeUserLanguageRequestDTO {
  static schema = z.object({ language: z.enum(USER_LANGUAGES) });

  @ApiProperty({ enum: USER_LANGUAGES, example: 'english' })
  language!: UserLanguage;
}

export const ChangeUserLanguageBodyDTO = ChangeUserLanguageRequestDTO.schema;
export type ChangeUserLanguageBodyInputDTO = z.infer<typeof ChangeUserLanguageBodyDTO>;

export class ChangeUserLanguageUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(userId: string, input: ChangeUserLanguageBodyInputDTO) {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const updatedAt = new Date();
    await this.repo.updateLanguageById(userId, input.language, updatedAt);
    return { ...user, language: input.language, updatedAt };
  }
}
