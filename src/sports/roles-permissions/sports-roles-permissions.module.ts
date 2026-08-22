import { Module } from '@nestjs/common';
import { SportsDynamicRolesController } from './sports-dynamic-roles.controller';
import { SportsDynamicRolesService } from './sports-dynamic-roles.service';
import { SportsPermissionsRegistryController } from './sports-permissions-registry.controller';
import { SportsPermissionsRegistryService } from './sports-permissions-registry.service';
import { SportsAuthModule } from '../auth/sports-auth.module';

@Module({
  imports: [SportsAuthModule],
  controllers: [SportsDynamicRolesController, SportsPermissionsRegistryController],
  providers: [SportsDynamicRolesService, SportsPermissionsRegistryService],
  exports: [SportsDynamicRolesService, SportsPermissionsRegistryService],
})
export class SportsRolesPermissionsModule {}
