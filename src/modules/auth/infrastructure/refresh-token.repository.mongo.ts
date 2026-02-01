import { Inject } from '@nestjs/common';
import { Model, Schema, Document } from 'mongoose';

export const REFRESH_TOKEN_MODEL = 'REFRESH_TOKEN_MODEL';

export type RefreshTokenDoc = Document & {
  uuid: string;
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

export function makeRefreshTokenSchema() {
  return new Schema<RefreshTokenDoc>({
    uuid: { type: String, unique: true, index: true, required: true },
    token: { type: String, unique: true, index: true, required: true },
    userId: { type: String, index: true, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  });
}

import {
  RefreshTokenRepository,
  RefreshTokenRecord,
} from '../domain/refresh-token.repository.interface';

export class RefreshTokenRepositoryMongo implements RefreshTokenRepository {
  private readonly model: Model<RefreshTokenDoc>;

  constructor(@Inject(REFRESH_TOKEN_MODEL) model: Model<RefreshTokenDoc>) {
    this.model = model;
  }

  async save(record: RefreshTokenRecord): Promise<void> {
    await this.model.create({
      uuid: record.uuid,
      token: record.token,
      userId: record.userId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
  }

  async findByToken(token: string): Promise<RefreshTokenRecord | null> {
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

  async deleteByTokenAndUserId(token: string, userId: string): Promise<void> {
    await this.model.deleteOne({ token, userId });
  }
}
