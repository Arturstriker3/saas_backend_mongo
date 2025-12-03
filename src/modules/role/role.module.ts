import { Module } from '@nestjs/common';
import { RolesGuard } from './presentation/role.guard';

@Module({ providers: [RolesGuard], exports: [RolesGuard] })
export class RoleModule {}
