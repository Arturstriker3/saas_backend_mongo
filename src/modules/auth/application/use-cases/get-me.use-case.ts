import { z } from 'zod';
import { NotFoundException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import type { UserEntity } from '../../../user/domain/user.entity';

export class GetMeRequestDTO {
  static schema = z.object({ userId: z.string().min(1) });

  @ApiProperty({ example: 'f9f7f48e-1491-4de0-87e7-e3fd615f8026' })
  userId!: string;
}

export const GetMeDTO = GetMeRequestDTO.schema;
export type GetMeInputDTO = z.infer<typeof GetMeDTO>;

export class GetMeResponseDTO {
  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ example: 'USER' })
  role!: string;

  @ApiProperty({ enum: ['portuguese', 'english', 'spanish'], example: 'english' })
  language!: UserEntity['language'];

  @ApiProperty({ format: 'date-time', nullable: true })
  birthDate!: UserEntity['birthDate'];
}

export type GetMeOutputDTO = GetMeResponseDTO;

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
