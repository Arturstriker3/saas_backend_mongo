import mongoose, { Connection, ConnectOptions } from 'mongoose';
import { Provider } from '@nestjs/common';
import { loadEnv } from '../config/env';

export const MONGO_CONNECTION = 'MONGO_CONNECTION';
export type MongooseConnection = Connection;

function parseInteger(value: string, fallback: number, min: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return fallback;
  return parsed;
}

export function buildMongoConnectionOptions(env: ReturnType<typeof loadEnv>): ConnectOptions {
  const maxPoolSize = parseInteger(env.MONGO_MAX_POOL_SIZE, 100, 1);
  const minPoolSize = Math.min(parseInteger(env.MONGO_MIN_POOL_SIZE, 10, 0), maxPoolSize);
  return {
    dbName: env.MONGO_DB_NAME,
    maxPoolSize,
    minPoolSize,
    serverSelectionTimeoutMS: parseInteger(env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 5000, 1),
    socketTimeoutMS: parseInteger(env.MONGO_SOCKET_TIMEOUT_MS, 45000, 1),
    connectTimeoutMS: parseInteger(env.MONGO_CONNECT_TIMEOUT_MS, 10000, 1),
    maxIdleTimeMS: parseInteger(env.MONGO_MAX_IDLE_TIME_MS, 30000, 1),
  };
}

export const mongoConnectionProvider: Provider = {
  provide: MONGO_CONNECTION,
  useFactory: (): MongooseConnection => {
    const env = loadEnv();
    const conn = mongoose.createConnection(env.MONGO_URI, buildMongoConnectionOptions(env));
    return conn;
  },
};
