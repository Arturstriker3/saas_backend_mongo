import { Inject } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserRepository } from '../domain/user.repository.interface';
import { UserEntity, USER_CONSTANTS, makeUserSchema } from '../domain/user.entity';
import { v7 as uuidv7 } from 'uuid';
import { MONGO_CONNECTION } from '../../../common/database/mongo.connection';
import type { MongooseConnection } from '../../../common/database/mongo.connection';

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
    const docs = await this.model
      .find({})
      .select('uuid name email createdAt updatedAt isActive role credits')
      .lean();
    return docs as unknown as UserEntity[];
  }

  async findById(id: string): Promise<UserEntity | null> {
    const doc = await this.model
      .findOne({ uuid: id })
      .select('uuid name email createdAt updatedAt isActive role credits')
      .lean();
    return (doc as UserEntity) ?? null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.model
      .findOne({ email: email.toLowerCase() })
      .select('uuid name email createdAt updatedAt isActive role credits')
      .lean();
    return (doc as UserEntity) ?? null;
  }

  async findByEmailWithPassword(email: string): Promise<UserEntity | null> {
    const doc = await this.model
      .findOne({ email: email.toLowerCase() })
      .select('uuid name email createdAt updatedAt isActive role credits +passwordHash')
      .lean();
    return (doc as UserEntity) ?? null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const exists = await this.model.exists({ email: email.toLowerCase() });
    return Boolean(exists);
  }

  async updateNameById(id: string, name: string, updatedAt: Date): Promise<boolean> {
    const result = await this.model.updateOne({ uuid: id }, { $set: { name, updatedAt } });
    return result.matchedCount > 0;
  }

  async updatePasswordById(id: string, passwordHash: string, updatedAt: Date): Promise<boolean> {
    const result = await this.model.updateOne({ uuid: id }, { $set: { passwordHash, updatedAt } });
    return result.matchedCount > 0;
  }

  async updateActiveById(id: string, isActive: boolean, updatedAt: Date): Promise<boolean> {
    const result = await this.model.updateOne({ uuid: id }, { $set: { isActive, updatedAt } });
    return result.matchedCount > 0;
  }
}
