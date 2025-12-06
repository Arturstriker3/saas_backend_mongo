import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import {
  CreateUserUseCase,
  CreateUserInputDTO,
} from '../../application/use-cases/create-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { ActivateUserUseCase } from '../../application/use-cases/activate-user.use-case';
import {
  ChangeUserNameUseCase,
  ChangeUserNameInputDTO,
} from '../../application/use-cases/change-user-name.use-case';
import {
  ChangeUserPasswordUseCase,
  ChangeUserPasswordInputDTO,
} from '../../application/use-cases/change-user-password.use-case';
import { DeactivateUserUseCase } from '../../application/use-cases/deactivate-user.use-case';
import { UserEntity } from '../../domain/user.entity';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    @Inject(CreateUserUseCase) private readonly createUseCase: CreateUserUseCase,
    @Inject(ListUsersUseCase) private readonly listUseCase: ListUsersUseCase,
    @Inject(ActivateUserUseCase) private readonly activateUseCase: ActivateUserUseCase,
    @Inject(ChangeUserNameUseCase) private readonly changeNameUseCase: ChangeUserNameUseCase,
    @Inject(ChangeUserPasswordUseCase)
    private readonly changePasswordUseCase: ChangeUserPasswordUseCase,
    @Inject(DeactivateUserUseCase) private readonly deactivateUseCase: DeactivateUserUseCase,
  ) {}

  @Get()
  async list() {
    const entities = await this.listUseCase.execute();
    return entities.map(this.toJSON);
  }

  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
        role: { type: 'string' },
        credits: { type: 'number' },
      },
      required: ['name', 'email', 'password', 'role', 'credits'],
    },
  })
  async create(@Body() body: CreateUserInputDTO) {
    const entity = await this.createUseCase.execute(body);
    return this.toJSON(entity);
  }

  @Post(':uuid/activate')
  async activate(@Param('uuid') uuid: string) {
    const entity = await this.activateUseCase.execute({ uuid });
    return this.toJSON(entity);
  }

  @Put(':uuid/name')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  })
  async changeName(@Param('uuid') uuid: string, @Body() body: ChangeUserNameInputDTO) {
    const entity = await this.changeNameUseCase.execute({ uuid, name: body.name });
    return this.toJSON(entity);
  }

  @Put(':uuid/password')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { newPassword: { type: 'string' } },
      required: ['newPassword'],
    },
  })
  async changePassword(@Param('uuid') uuid: string, @Body() body: ChangeUserPasswordInputDTO) {
    const entity = await this.changePasswordUseCase.execute({
      uuid,
      newPassword: body.newPassword,
    });
    return this.toJSON(entity);
  }

  @Post(':uuid/deactivate')
  async deactivate(@Param('uuid') uuid: string) {
    const entity = await this.deactivateUseCase.execute({ uuid });
    return this.toJSON(entity);
  }

  private toJSON(entity: UserEntity) {
    return {
      uuid: entity.uuid,
      name: entity.name,
      email: entity.email,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      isActive: entity.isActive,
      role: entity.role,
      credits: entity.credits,
    };
  }
}
