import { Module } from "@nestjs/common";
import { AnticiposController } from "./anticipos.controller";

@Module({
  controllers: [AnticiposController],
})
export class AnticiposModule {}
