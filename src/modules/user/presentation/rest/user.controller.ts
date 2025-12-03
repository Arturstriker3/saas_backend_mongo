import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { ActivateUserUseCase } from '../../application/use-cases/activate-user.use-case';
import { ChangeUserNameUseCase } from '../../application/use-cases/change-user-name.use-case';
import { ChangeUserPasswordUseCase } from '../../application/use-cases/change-user-password.use-case';
import { DeactivateUserUseCase } from '../../application/use-cases/deactivate-user.use-case';
import { CreateUserBody, ChangeUserNameBody, ChangeUserPasswordBody } from './user.dto';
import { UserEntity } from '../../domain/user.entity';

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
  async create(@Body() body: CreateUserBody) {
    const entity = await this.createUseCase.execute(body);
    return this.toJSON(entity);
  }

  @Post(':id/activate')
  async activate(@Param('id') id: string) {
    const entity = await this.activateUseCase.execute({ id });
    return this.toJSON(entity);
  }

  @Put(':id/name')
  async changeName(@Param('id') id: string, @Body() body: ChangeUserNameBody) {
    const entity = await this.changeNameUseCase.execute({ id, name: body.name });
    return this.toJSON(entity);
  }

  @Put(':id/password')
  async changePassword(@Param('id') id: string, @Body() body: ChangeUserPasswordBody) {
    const entity = await this.changePasswordUseCase.execute({
      id,
      newPasswordHash: body.newPasswordHash,
    });
    return this.toJSON(entity);
  }

  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    const entity = await this.deactivateUseCase.execute({ id });
    return this.toJSON(entity);
  }

  private toJSON(entity: UserEntity) {
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      birthDate: entity.birthDate,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      isActive: entity.isActive,
      role: entity.role,
      credits: entity.credits,
    };
  }
}
