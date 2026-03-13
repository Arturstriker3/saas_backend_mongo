import { Controller, Get, Post, Put, Body, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBody, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  CreateUserUseCase,
  CreateUserDTO,
  type CreateUserInputDTO,
} from '../../application/use-cases/create-user.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import {
  ActivateUserDTO,
  ActivateUserUseCase,
  type ActivateUserInputDTO,
} from '../../application/use-cases/activate-user.use-case';
import {
  ChangeUserNameBodyDTO,
  ChangeUserNameParamDTO,
  ChangeUserNameUseCase,
  type ChangeUserNameBodyInputDTO,
  type ChangeUserNameParamInputDTO,
} from '../../application/use-cases/change-user-name.use-case';
import {
  ChangeUserPasswordBodyDTO,
  ChangeUserPasswordParamDTO,
  ChangeUserPasswordUseCase,
  type ChangeUserPasswordBodyInputDTO,
  type ChangeUserPasswordParamInputDTO,
} from '../../application/use-cases/change-user-password.use-case';
import {
  DeactivateUserUseCase,
  type DeactivateUserInputDTO,
} from '../../application/use-cases/deactivate-user.use-case';
import {
  ToggleUserActiveDTO,
  ToggleUserActiveUseCase,
  type ToggleUserActiveInputDTO,
} from '../../application/use-cases/toggle-user-active.use-case';
import { UserEntity } from '../../domain/user.entity';
import { Authenticated } from '../../../../common/http/access.decorator';
import { ZodValidationPipe } from '../../../../common/http/zod-validation.pipe';

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
    @Inject(ToggleUserActiveUseCase)
    private readonly toggleUserActiveUseCase: ToggleUserActiveUseCase,
  ) {}

  @Get()
  @Authenticated('ADMIN')
  async list() {
    const entities = await this.listUseCase.execute();
    return entities.map(this.toJSON);
  }

  @Post()
  @Authenticated('ADMIN')
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
  async create(@Body(new ZodValidationPipe(CreateUserDTO)) body: CreateUserInputDTO) {
    const entity = await this.createUseCase.execute(body);
    return this.toJSON(entity);
  }

  @Post(':uuid/activate')
  @Authenticated('ADMIN')
  async activate(@Param(new ZodValidationPipe(ActivateUserDTO)) params: ActivateUserInputDTO) {
    const entity = await this.activateUseCase.execute(params);
    return this.toJSON(entity);
  }

  @Post(':uuid/toggle-active')
  @Authenticated('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'uuid', type: String, required: true })
  @ApiOkResponse({ description: 'User active status toggled' })
  async toggleActive(
    @Param(new ZodValidationPipe(ToggleUserActiveDTO)) params: ToggleUserActiveInputDTO,
  ) {
    const entity = await this.toggleUserActiveUseCase.execute(params);
    return this.toJSON(entity);
  }

  @Put(':uuid/name')
  @Authenticated('ADMIN')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  })
  async changeName(
    @Param(new ZodValidationPipe(ChangeUserNameParamDTO)) params: ChangeUserNameParamInputDTO,
    @Body(new ZodValidationPipe(ChangeUserNameBodyDTO)) body: ChangeUserNameBodyInputDTO,
  ) {
    const entity = await this.changeNameUseCase.execute({ uuid: params.uuid, name: body.name });
    return this.toJSON(entity);
  }

  @Put(':uuid/password')
  @Authenticated('ADMIN')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { newPassword: { type: 'string' } },
      required: ['newPassword'],
    },
  })
  async changePassword(
    @Param(new ZodValidationPipe(ChangeUserPasswordParamDTO))
    params: ChangeUserPasswordParamInputDTO,
    @Body(new ZodValidationPipe(ChangeUserPasswordBodyDTO))
    body: ChangeUserPasswordBodyInputDTO,
  ) {
    const entity = await this.changePasswordUseCase.execute({
      uuid: params.uuid,
      newPassword: body.newPassword,
    });
    return this.toJSON(entity);
  }

  @Post('deactivate')
  @Authenticated()
  @HttpCode(HttpStatus.OK)
  async deactivate(@Req() req: FastifyRequest & { user: { userId: string } }) {
    const params: DeactivateUserInputDTO = { userId: req.user.userId };
    const entity = await this.deactivateUseCase.execute(params);
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
