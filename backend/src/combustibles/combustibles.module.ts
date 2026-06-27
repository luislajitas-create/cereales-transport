import { Module } from "@nestjs/common";
import { CombustiblesController } from "./combustibles.controller";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [CombustiblesController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class CombustiblesModule {}
