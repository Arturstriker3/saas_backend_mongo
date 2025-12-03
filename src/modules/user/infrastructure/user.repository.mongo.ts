import { Inject } from "@nestjs/common";
import { Model } from "mongoose";
import { USER_MODEL } from "../tokens";
import { UserRepository } from "../domain/user.repository";
import { UserEntity, USER_CONSTANTS } from "../domain/user.entity";
import { v7 as uuidv7 } from "uuid";

export class UserRepositoryMongo implements UserRepository {
  private readonly model: Model<UserEntity>;

  constructor(@Inject(USER_MODEL) model: Model<UserEntity>) {
    this.model = model;
  }

  async create(props: {
    name: string;
    email: string;
    passwordHash: string;
    birthDate: Date;
    role: string;
    credits: number;
  }): Promise<UserEntity> {
    const id = uuidv7();
    const now = new Date();
    const doc = await this.model.create({
      id,
      email: props.email.toLowerCase(),
      name: props.name.trim(),
      passwordHash: props.passwordHash,
      birthDate: props.birthDate,
      role: props.role ?? USER_CONSTANTS.ROLE_DEFAULT,
      createdAt: now,
      updatedAt: now,
      isActive: true,
      credits: props.credits,
    });
    return doc as UserEntity;
  }

  async findAll(): Promise<UserEntity[]> {
    const docs = await this.model.find({}).select("+passwordHash");
    return docs as unknown as UserEntity[];
  }

  async findById(id: string): Promise<UserEntity | null> {
    const doc = await this.model.findOne({ id }).select("+passwordHash");
    return (doc as UserEntity) ?? null;
  }

  async save(user: UserEntity): Promise<void> {
    user.updatedAt = new Date();
    await (user as any).save();
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const doc = await this.model
      .findOne({ email: email.toLowerCase() })
      .select("+passwordHash");
    return (doc as UserEntity) ?? null;
  }
}
