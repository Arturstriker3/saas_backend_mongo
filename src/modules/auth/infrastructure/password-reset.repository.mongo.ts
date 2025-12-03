import { Inject } from '@nestjs/common';
import { Model, Schema, Document } from 'mongoose';

export const PASSWORD_RESET_MODEL = 'PASSWORD_RESET_MODEL';

export type PasswordResetDoc = Document & {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

export function makePasswordResetSchema() {
  return new Schema<PasswordResetDoc>({
    token: { type: String, unique: true, index: true, required: true },
    userId: { type: String, index: true, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  });
}

import { PasswordResetRepository, PasswordResetRecord } from '../domain/password-reset.repository';

export class PasswordResetRepositoryMongo implements PasswordResetRepository {
  private readonly model: Model<PasswordResetDoc>;

  constructor(@Inject(PASSWORD_RESET_MODEL) model: Model<PasswordResetDoc>) {
    this.model = model;
  }

  async save(record: PasswordResetRecord): Promise<void> {
    await this.model.create({
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
