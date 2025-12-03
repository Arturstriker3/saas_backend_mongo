import { Schema, Document } from 'mongoose';
import { ROLES } from '../../role/domain/role.types';

export const USER_CONSTANTS = {
  NAME_MIN_LENGTH: 2,
  PASSWORD_HASH_MIN_LENGTH: 10,
  ROLE_DEFAULT: 'USER',
  CREDITS_MIN: 0,
  CREDITS_MAX: 99999,
};

export type UserEntity = Document & {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  birthDate: Date;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  credits: number;
  activate: () => void;
  deactivate: () => void;
  changePassword: (newHash: string) => void;
  changeName: (newName: string) => void;
};

export function makeUserSchema() {
  const schema = new Schema<UserEntity>({
    id: { type: String, unique: true, index: true, required: true },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: USER_CONSTANTS.NAME_MIN_LENGTH,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    birthDate: { type: Date, required: true },
    role: {
      type: String,
      enum: ROLES,
      default: USER_CONSTANTS.ROLE_DEFAULT,
      required: true,
    },
    isActive: { type: Boolean, default: true, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
    updatedAt: { type: Date, default: Date.now, required: true },
    credits: {
      type: Number,
      default: 0,
      min: USER_CONSTANTS.CREDITS_MIN,
      required: true,
    },
  });

  schema.methods.activate = function () {
    if (this.isActive) return;
    this.isActive = true;
    this.updatedAt = new Date();
  };

  schema.methods.deactivate = function () {
    if (!this.isActive) return;
    this.isActive = false;
    this.updatedAt = new Date();
  };

  schema.methods.changePassword = function (newHash: string) {
    if (!newHash || newHash.length < USER_CONSTANTS.PASSWORD_HASH_MIN_LENGTH) return;
    this.passwordHash = newHash;
    this.updatedAt = new Date();
  };

  schema.methods.changeName = function (newName: string) {
    if (!newName || newName.length < USER_CONSTANTS.NAME_MIN_LENGTH) return;
    this.name = newName.trim();
    this.updatedAt = new Date();
  };

  return schema;
}
