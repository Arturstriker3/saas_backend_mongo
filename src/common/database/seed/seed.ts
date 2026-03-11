import { Logger } from '@nestjs/common';
import mongoose from 'mongoose';
import { loadEnv } from '../../config/env';
import { buildMongoConnectionOptions } from '../mongo.connection';
import { v7 as uuidv7 } from 'uuid';
import * as argon2 from 'argon2';

const logger = new Logger('Seed');

export async function runSeed() {
  const env = loadEnv();
  const conn = await mongoose.createConnection(env.MONGO_URI, buildMongoConnectionOptions(env));
  const userSchema = new mongoose.Schema({
    uuid: { type: String, unique: true, index: true, required: true },
    email: { type: String, unique: true, index: true, required: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    isActive: { type: Boolean, required: true },
    credits: { type: Number, required: true, default: 0, min: 0 },
  });
  const UserModel = conn.model('users', userSchema);
  try {
    const email = env.SUPER_ADMIN_EMAIL.toLowerCase();
    const exists = await UserModel.findOne({ email }).lean();
    if (exists) {
      logger.log('Skipped: SUPER ADMIN already exists');
      await conn.close();
      return;
    }
    const uuid = uuidv7();
    const name = env.SUPER_ADMIN_NAME;
    const passwordHash = await argon2.hash(env.SUPER_ADMIN_PASSWORD, { type: argon2.argon2id });
    const role = 'ADMIN';
    const now = new Date();
    const isActive = true;
    await UserModel.create({
      uuid,
      email,
      name,
      passwordHash,
      role,
      createdAt: now,
      updatedAt: now,
      isActive,
      credits: 0,
    });
    logger.log('Applied: SUPER ADMIN created');
    await conn.close();
  } catch (err) {
    logger.error('Aborted', err);
    await conn.close();
    process.exit(1);
  }
}

if (require.main === module) {
  runSeed();
}
