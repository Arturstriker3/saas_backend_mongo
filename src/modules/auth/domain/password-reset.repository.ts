export type PasswordResetRecord = {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

export interface PasswordResetRepository {
  save(record: PasswordResetRecord): Promise<void>;
  findByToken(token: string): Promise<PasswordResetRecord | null>;
  deleteByToken(token: string): Promise<void>;
}
