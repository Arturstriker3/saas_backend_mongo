export type RefreshTokenRecord = {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

export interface RefreshTokenRepository {
  save(record: RefreshTokenRecord): Promise<void>;
  findByToken(token: string): Promise<RefreshTokenRecord | null>;
  deleteByToken(token: string): Promise<void>;
}
