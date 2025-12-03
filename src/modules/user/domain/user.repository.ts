import { UserEntity } from "./user.entity";

export interface UserRepository {
  create(props: {
    name: string;
    email: string;
    passwordHash: string;
    birthDate: Date;
    role: string;
    credits: number;
  }): Promise<UserEntity>;
  findAll(): Promise<UserEntity[]>;
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<void>;
}
