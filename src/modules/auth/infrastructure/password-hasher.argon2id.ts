import * as argon2 from 'argon2';
import { PasswordHasher } from '../domain/password-hasher.interface';

export class Argon2idPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
