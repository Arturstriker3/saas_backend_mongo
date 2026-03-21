import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import { UserRepository } from '../../domain/user.repository.interface';

export class ChangeUserNameParamsDTO {
  static schema = z.object({ uuid: z.string().min(1) });

  @ApiProperty({ example: 'f9f7f48e-1491-4de0-87e7-e3fd615f8026' })
  uuid!: string;
}

export class ChangeUserNameRequestDTO {
  static schema = z.object({ name: z.string().min(3) });

  @ApiProperty({ example: 'John Smith' })
  name!: string;
}

export const ChangeUserNameParamDTO = ChangeUserNameParamsDTO.schema;
export const ChangeUserNameBodyDTO = ChangeUserNameRequestDTO.schema;
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
