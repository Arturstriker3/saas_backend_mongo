import { z } from 'zod';
import { NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../../user/domain/user.repository.interface';

export const GetMeDTO = z.object({ userId: z.string().min(1) });
export type GetMeInputDTO = z.infer<typeof GetMeDTO>;

export type GetMeOutputDTO = {
  name: string;
  email: string;
  createdAt: Date;
  role: string;
  credits: number;
};

export class GetMeUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(input: GetMeInputDTO): Promise<GetMeOutputDTO> {
    const { userId } = GetMeDTO.parse(input);
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      role: user.role,
      credits: user.credits,
    };
  }
}
