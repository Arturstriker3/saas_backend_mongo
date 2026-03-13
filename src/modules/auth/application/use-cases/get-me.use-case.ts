import { z } from 'zod';
import { NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { UserEntity } from '../../../user/domain/user.entity';

export const GetMeDTO = z.object({ userId: z.string().min(1) });
export type GetMeInputDTO = z.infer<typeof GetMeDTO>;

export type GetMeOutputDTO = {
  name: string;
  email: string;
  createdAt: Date;
  role: string;
  language: UserEntity['language'];
  birthDate: UserEntity['birthDate'];
};

export class GetMeUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(input: GetMeInputDTO): Promise<GetMeOutputDTO> {
    const user = await this.users.findById(input.userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      role: user.role,
      language: user.language,
      birthDate: user.birthDate,
    };
  }
}
