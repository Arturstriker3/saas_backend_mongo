import mongoose from "mongoose";
import { loadEnv } from "../../config/env";
import { v7 as uuidv7 } from "uuid";
import * as bcrypt from "bcrypt";

export async function runSeed() {
  const env = loadEnv();
  const conn = await mongoose.createConnection(env.MONGO_URI, {
    dbName: env.MONGO_DB_NAME,
  });
  const userSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true, required: true },
    email: { type: String, unique: true, index: true, required: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    birthDate: { type: Date, required: true },
    role: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    isActive: { type: Boolean, required: true },
  });
  const UserModel = conn.model("users", userSchema);
  try {
    const email = env.SUPER_ADMIN_EMAIL.toLowerCase();
    const exists = await UserModel.findOne({ email }).lean();
    if (exists) {
      console.log("[seed] skipped: SUPER ADMIN already exists");
      await conn.close();
      return;
    }
    const id = uuidv7();
    const name = env.SUPER_ADMIN_NAME;
    const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 10);
    const role = "ADMIN";
    const now = new Date();
    const birth = new Date("1999-01-01T00:00:00Z");
    const isActive = true;
    await UserModel.create({
      id,
      email,
      name,
      passwordHash,
      birthDate: birth,
      role,
      createdAt: now,
      updatedAt: now,
      isActive,
    });
    console.log("[seed] applied: SUPER ADMIN created");
    await conn.close();
  } catch (err) {
    console.error("[seed] aborted", err);
    await conn.close();
    process.exit(1);
  }
}

if (require.main === module) {
  runSeed();
}

