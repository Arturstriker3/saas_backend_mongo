import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { RoleModule } from '../role/role.module';
import { UserRepositoryMongo } from './infrastructure/user.repository.mongo';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { ActivateUserUseCase } from './application/use-cases/activate-user.use-case';
import { ChangeUserNameUseCase } from './application/use-cases/change-user-name.use-case';
import { ChangeUserPasswordUseCase } from './application/use-cases/change-user-password.use-case';
import { DeactivateUserUseCase } from './application/use-cases/deactivate-user.use-case';
import { UserController } from './presentation/rest/user.controller';
import { BcryptPasswordHasher } from '../auth/infrastructure/password-hasher.bcrypt';

@Module({
  imports: [DatabaseModule, RoleModule],
  providers: [
    BcryptPasswordHasher,
    UserRepositoryMongo,
    {
      provide: CreateUserUseCase,
      useFactory: (repo: UserRepositoryMongo, hasher: BcryptPasswordHasher) =>
        new CreateUserUseCase(repo, hasher),
      inject: [UserRepositoryMongo, BcryptPasswordHasher],
    },
    {
      provide: ListUsersUseCase,
      useFactory: (repo: UserRepositoryMongo) => new ListUsersUseCase(repo),
      inject: [UserRepositoryMongo],
    },
    {
      provide: ActivateUserUseCase,
      useFactory: (repo: UserRepositoryMongo) => new ActivateUserUseCase(repo),
      inject: [UserRepositoryMongo],
    },
    {
      provide: ChangeUserNameUseCase,
      useFactory: (repo: UserRepositoryMongo) => new ChangeUserNameUseCase(repo),
      inject: [UserRepositoryMongo],
    },
    {
      provide: ChangeUserPasswordUseCase,
      useFactory: (repo: UserRepositoryMongo, hasher: BcryptPasswordHasher) =>
        new ChangeUserPasswordUseCase(repo, hasher),
      inject: [UserRepositoryMongo, BcryptPasswordHasher],
    },
    {
      provide: DeactivateUserUseCase,
      useFactory: (repo: UserRepositoryMongo) => new DeactivateUserUseCase(repo),
      inject: [UserRepositoryMongo],
    },
  ],
  controllers: [UserController],
  exports: [UserRepositoryMongo],
})
export class UserModule {}
