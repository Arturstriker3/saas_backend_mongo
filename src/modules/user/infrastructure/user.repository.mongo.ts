import { Inject } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserRepository } from '../domain/user.repository.interface';
import { UserEntity, USER_CONSTANTS, makeUserSchema } from '../domain/user.entity';
import { v7 as uuidv7 } from 'uuid';
import { MONGO_CONNECTION, MongooseConnection } from '../../../common/database/mongo.connection';

export class UserRepositoryMongo implements UserRepository {
  private readonly model: Model<UserEntity>;

  constructor(@Inject(MONGO_CONNECTION) conn: MongooseConnection) {
    this.model = conn.models['users'] ?? conn.model<UserEntity>('users', makeUserSchema());
  }

  async create(props: {
    name: string;
    email: string;
    passwordHash: string;
    role: string;
    credits: number;
  }): Promise<UserEntity> {
    const uuid = uuidv7();
    const now = new Date();
    const doc = await this.model.create({
      uuid,
      email: props.email.toLowerCase(),
      name: props.name.trim(),
      passwordHash: props.passwordHash,
      role: props.role ?? USER_CONSTANTS.ROLE_DEFAULT,
      createdAt: now,
      updatedAt: now,
      isActive: true,
      credits: props.credits,
    });
    return doc as UserEntity;
  }

  async findAll(): Promise<UserEntity[]> {
    const docs = await this.model.find({}).select('+passwordHash');
    return docs as unknown as UserEntity[];
  }

  async findById(id: string): Promise<UserEntity | null> {
    const doc = await this.model.findOne({ uuid: id }).select('+passwordHash');
    return (doc as UserEntity) ?? null;
  }

  async save(user: UserEntity): Promise<void> {
    user.updatedAt = new Date();
    await (user as any).save();
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.model.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    return (doc as UserEntity) ?? null;
  }
}
