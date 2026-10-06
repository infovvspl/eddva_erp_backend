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
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

import { SportsDashboardController } from './dashboard/sports-dashboard.controller';
import { SportsDashboardService } from './dashboard/sports-dashboard.service';

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
    DashboardController,
    SportsDashboardController,
  ],
  providers: [
    SportsAuthService,
    SportsDynamicRolesService,
    SportsPermissionsRegistryService,
    SportsCoreService,
    SportsHousesService,
    SportsTournamentsService,
    SportsRecordsService,
    DashboardService,
    SportsDashboardService,
  ],
  exports: [
    SportsAuthService,
    SportsDynamicRolesService,
    SportsPermissionsRegistryService,
    SportsHousesService,
    SportsTournamentsService,
    SportsRecordsService,
    DashboardService,
  ],
})
export class SportsModule {}
