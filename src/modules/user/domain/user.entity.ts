import { Schema } from 'mongoose';
import { ROLES } from '../../role/domain/role.types';

export const USER_LANGUAGES = ['portuguese', 'english', 'spanish'] as const;
export type UserLanguage = (typeof USER_LANGUAGES)[number];

export const USER_CONSTANTS = {
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  EMAIL_MIN_LENGTH: 5,
  EMAIL_MAX_LENGTH: 254,
  PASSWORD_MIN_LENGTH: 8,
  ROLE_DEFAULT: 'USER',
  IS_ACTIVE_DEFAULT: true,
  LANGUAGE_DEFAULT: 'portuguese' as UserLanguage,
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
  language: UserLanguage;
  birthDate: Date | null;
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
    language: {
      type: String,
      enum: USER_LANGUAGES,
      default: USER_CONSTANTS.LANGUAGE_DEFAULT,
      required: true,
    },
    birthDate: { type: Date, default: null, required: false },
    isActive: { type: Boolean, default: USER_CONSTANTS.IS_ACTIVE_DEFAULT, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
    updatedAt: { type: Date, default: Date.now, required: true },
  });

  return schema;
}
