import { Module } from '@nestjs/common';
import { SportsAuthModule } from './auth/sports-auth.module';
import { SportsAuthController } from './auth/sports-auth.controller';
import { SportsAuthService } from './auth/sports-auth.service';

import { SportsRolesPermissionsModule } from './roles-permissions/sports-roles-permissions.module';
import { SportsDynamicRolesController } from './roles-permissions/sports-dynamic-roles.controller';
import { SportsDynamicRolesService } from './roles-permissions/sports-dynamic-roles.service';
import { SportsPermissionsRegistryController } from './roles-permissions/sports-permissions-registry.controller';
import { SportsPermissionsRegistryService } from './roles-permissions/sports-permissions-registry.service';

import { SportsCoreController } from './core/sports-core.controller';
import { SportsCoreService } from './core/sports-core.service';

import { SportsHousesController } from './houses/sports-houses.controller';
import { SportsHousesService } from './houses/sports-houses.service';

import { SportsTournamentsController } from './tournaments/sports-tournaments.controller';
import { SportsTournamentsService } from './tournaments/sports-tournaments.service';

import { SportsRecordsController } from './records-awards/sports-records.controller';
import { SportsRecordsService } from './records-awards/sports-records.service';

@Module({
  imports: [SportsAuthModule, SportsRolesPermissionsModule],
  controllers: [
    SportsAuthController,
    SportsDynamicRolesController,
    SportsPermissionsRegistryController,
    SportsCoreController,
    SportsHousesController,
    SportsTournamentsController,
    SportsRecordsController,
  ],
  providers: [
    SportsAuthService,
    SportsDynamicRolesService,
    SportsPermissionsRegistryService,
    SportsCoreService,
    SportsHousesService,
    SportsTournamentsService,
    SportsRecordsService,
  ],
  exports: [
    SportsAuthService,
    SportsDynamicRolesService,
    SportsPermissionsRegistryService,
    SportsHousesService,
    SportsTournamentsService,
    SportsRecordsService,
  ],
})
export class SportsModule {}
