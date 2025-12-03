import { Inject } from "@nestjs/common";
import { Model, Schema, Document } from "mongoose";
import { USER_MODEL } from "../tokens";
import { UserRepository } from "../domain/user.repository";
import { UserEntity } from "../domain/user.entity";
import { v7 as uuidv7 } from "uuid";

export type UserDoc = Document & {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  birthDate: Date;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
};

export function makeUserSchema() {
  return new Schema<UserDoc>({
    id: { type: String, unique: true, index: true, required: true },
    email: { type: String, unique: true, index: true, required: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    birthDate: { type: Date, required: true },
    role: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    isActive: { type: Boolean, required: true },
  });
}

export class UserRepositoryMongo implements UserRepository {
  private readonly model: Model<UserDoc>;

  constructor(@Inject(USER_MODEL) model: Model<UserDoc>) {
    this.model = model;
  }

  async create(props: {
    name: string;
    email: string;
    passwordHash: string;
    birthDate: Date;
    role: string;
  }): Promise<UserEntity> {
    const id = uuidv7();
    const now = new Date();
    const isActive = false;
    await this.model.create({
      id,
      email: props.email.toLowerCase(),
      name: props.name,
      passwordHash: props.passwordHash,
      birthDate: props.birthDate,
      role: props.role,
      createdAt: now,
      updatedAt: now,
      isActive,
    });
    return new UserEntity({
      id,
      name: props.name,
      email: props.email.toLowerCase(),
      passwordHash: props.passwordHash,
      birthDate: props.birthDate,
      role: props.role,
      createdAt: now,
      updatedAt: now,
      isActive,
    });
  }

  async findAll(): Promise<UserEntity[]> {
    const docs = await this.model.find({}).lean();
    return docs.map(
      (row) =>
        new UserEntity({
          id: String(row.id),
          email: String(row.email),
          name: String(row.name),
          passwordHash: String(row.passwordHash),
          birthDate: new Date(row.birthDate),
          role: String(row.role),
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
          isActive: Boolean(row.isActive),
        })
    );
  }

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.model.findOne({ id }).lean();
    if (!row) return null;
    return new UserEntity({
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      passwordHash: String(row.passwordHash),
      birthDate: new Date(row.birthDate),
      role: String(row.role),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      isActive: Boolean(row.isActive),
    });
  }

  async save(user: UserEntity): Promise<void> {
    await this.model.updateOne(
      { id: user.id },
      {
        $set: {
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          birthDate: user.birthDate,
          role: user.role,
          updatedAt: user.updatedAt,
          isActive: user.isActive,
        },
      }
    );
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.model.findOne({ email: email.toLowerCase() }).lean();
    if (!row) return null;
    return new UserEntity({
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      passwordHash: String(row.passwordHash),
      birthDate: new Date(row.birthDate),
      role: String(row.role),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      isActive: Boolean(row.isActive),
    });
  }
}
