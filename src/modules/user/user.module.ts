import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../common/database/database.module";
import { USER_MODEL, USER_REPOSITORY } from "./tokens";
import { UserRepository } from "./domain/user.repository";
import { UserRepositoryMongo } from "./infrastructure/user.repository.mongo";
import { makeUserSchema, UserEntity } from "./domain/user.entity";
import { CreateUserUseCase } from "./application/use-cases/create-user.use-case";
import { ListUsersUseCase } from "./application/use-cases/list-users.use-case";
import { ActivateUserUseCase } from "./application/use-cases/activate-user.use-case";
import { ChangeUserNameUseCase } from "./application/use-cases/change-user-name.use-case";
import { ChangeUserPasswordUseCase } from "./application/use-cases/change-user-password.use-case";
import { DeactivateUserUseCase } from "./application/use-cases/deactivate-user.use-case";
import { UserController } from "./presentation/rest/user.controller";
import { MONGO_CONNECTION, MongooseConnection } from "../../common/database/mongo.connection";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: USER_MODEL,
      useFactory: (conn: MongooseConnection) => conn.model<UserEntity>("users", makeUserSchema()),
      inject: [MONGO_CONNECTION],
    },
    { provide: USER_REPOSITORY, useClass: UserRepositoryMongo },
    {
      provide: CreateUserUseCase,
      useFactory: (repo: UserRepository) => new CreateUserUseCase(repo),
      inject: [USER_REPOSITORY],
    },
    {
      provide: ListUsersUseCase,
      useFactory: (repo: UserRepository) => new ListUsersUseCase(repo),
      inject: [USER_REPOSITORY],
    },
    {
      provide: ActivateUserUseCase,
      useFactory: (repo: UserRepository) => new ActivateUserUseCase(repo),
      inject: [USER_REPOSITORY],
    },
    {
      provide: ChangeUserNameUseCase,
      useFactory: (repo: UserRepository) => new ChangeUserNameUseCase(repo),
      inject: [USER_REPOSITORY],
    },
    {
      provide: ChangeUserPasswordUseCase,
      useFactory: (repo: UserRepository) => new ChangeUserPasswordUseCase(repo),
      inject: [USER_REPOSITORY],
    },
    {
      provide: DeactivateUserUseCase,
      useFactory: (repo: UserRepository) => new DeactivateUserUseCase(repo),
      inject: [USER_REPOSITORY],
    },
  ],
  controllers: [UserController],
  exports: [USER_REPOSITORY],
})
export class UserModule {}
