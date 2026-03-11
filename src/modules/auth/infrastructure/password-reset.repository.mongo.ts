import { Inject } from '@nestjs/common';
import { Model, Schema, Document } from 'mongoose';

export const PASSWORD_RESET_MODEL = 'PASSWORD_RESET_MODEL';

export type PasswordResetDoc = Document & {
  uuid: string;
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

export function makePasswordResetSchema() {
  const schema = new Schema<PasswordResetDoc>({
    uuid: { type: String, unique: true, index: true, required: true },
    token: { type: String, unique: true, index: true, required: true },
    userId: { type: String, index: true, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return schema;
}

import {
  PasswordResetRepository,
  PasswordResetRecord,
} from '../domain/password-reset.repository.interface';

export class PasswordResetRepositoryMongo implements PasswordResetRepository {
  private readonly model: Model<PasswordResetDoc>;

  constructor(@Inject(PASSWORD_RESET_MODEL) model: Model<PasswordResetDoc>) {
    this.model = model;
  }

  async save(record: PasswordResetRecord): Promise<void> {
    await this.model.create({
      uuid: record.uuid,
      token: record.token,
      userId: record.userId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
  }

  async findByToken(token: string): Promise<PasswordResetRecord | null> {
    const row = await this.model.findOne({ token }).lean();
    if (!row) return null;
    return {
      uuid: String(row.uuid),
      token: String(row.token),
      userId: String(row.userId),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
    };
  }

  async deleteByToken(token: string): Promise<void> {
    await this.model.deleteOne({ token });
  }
}
