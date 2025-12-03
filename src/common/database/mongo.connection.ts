import mongoose, { Connection } from "mongoose";
import { Provider } from "@nestjs/common";
import { loadEnv } from "../config/env";

export const MONGO_CONNECTION = "MONGO_CONNECTION";
export type MongooseConnection = Connection;

export const mongoConnectionProvider: Provider = {
  provide: MONGO_CONNECTION,
  useFactory: (): MongooseConnection => {
    const env = loadEnv();
    const conn = mongoose.createConnection(env.MONGO_URI, {
      dbName: env.MONGO_DB_NAME,
    });
    return conn;
  },
};

