import { Schema } from 'mongoose';
import { ROLES } from '../../role/domain/role.types';

export const USER_CONSTANTS = {
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  EMAIL_MIN_LENGTH: 5,
  EMAIL_MAX_LENGTH: 254,
  PASSWORD_MIN_LENGTH: 8,
  ROLE_DEFAULT: 'USER',
  IS_ACTIVE_DEFAULT: true,
  CREDITS_DEFAULT: 0,
  CREDITS_MIN: 0,
  CREDITS_MAX: 999999,
};

export type UserEntity = {
  uuid: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  credits: number;
};

export function makeUserSchema() {
  const schema = new Schema<UserEntity>({
    uuid: { type: String, unique: true, index: true, required: true },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: USER_CONSTANTS.NAME_MIN_LENGTH,
      maxlength: USER_CONSTANTS.NAME_MAX_LENGTH,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
      maxlength: USER_CONSTANTS.EMAIL_MAX_LENGTH,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ROLES,
      default: USER_CONSTANTS.ROLE_DEFAULT,
      required: true,
    },
    isActive: { type: Boolean, default: USER_CONSTANTS.IS_ACTIVE_DEFAULT, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
    updatedAt: { type: Date, default: Date.now, required: true },
    credits: {
      type: Number,
      default: USER_CONSTANTS.CREDITS_DEFAULT,
      min: USER_CONSTANTS.CREDITS_MIN,
      max: USER_CONSTANTS.CREDITS_MAX,
      required: true,
    },
  });

  return schema;
}
