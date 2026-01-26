import { UserEntity } from './user.entity';

export interface UserRepository {
  create(props: {
    name: string;
    email: string;
    passwordHash: string;
    role: string;
    credits: number;
  }): Promise<UserEntity>;
  findAll(): Promise<UserEntity[]>;
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByEmailWithPassword(email: string): Promise<UserEntity | null>;
  existsByEmail(email: string): Promise<boolean>;
  updateNameById(id: string, name: string, updatedAt: Date): Promise<boolean>;
  updatePasswordById(id: string, passwordHash: string, updatedAt: Date): Promise<boolean>;
  updateActiveById(id: string, isActive: boolean, updatedAt: Date): Promise<boolean>;
}
