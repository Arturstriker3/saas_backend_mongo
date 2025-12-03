import { Module } from "@nestjs/common";
import { mongoConnectionProvider } from "./mongo.connection";

@Module({
  providers: [mongoConnectionProvider],
  exports: [mongoConnectionProvider],
})
export class DatabaseModule {}

