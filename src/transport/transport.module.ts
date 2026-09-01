import { Module } from '@nestjs/common';
import { TransportAuthModule } from './auth/transport-auth.module';
import { TransportRolesPermissionsModule } from './roles-permissions/transport-roles-permissions.module';
import { TransportAccessService } from './common/transport-access.service';
import { TransportAuditService } from './common/transport-audit.service';

import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';

import { RoutesController } from './routes/routes.controller';
import { RoutesService } from './routes/routes.service';

import { PassengersController } from './passengers/passengers.controller';
import { PassengersService } from './passengers/passengers.service';

import { DriversController } from './drivers/drivers.controller';
import { DriversService } from './drivers/drivers.service';

import { TrackingController } from './tracking/tracking.controller';
import { TrackingIngestController } from './tracking/tracking-ingest.controller';
import { TrackingService } from './tracking/tracking.service';

import { FeesController } from './fees/fees.controller';
import { FeesService } from './fees/fees.service';

@Module({
  imports: [TransportAuthModule, TransportRolesPermissionsModule],
  controllers: [
    VehiclesController,
    RoutesController,
    PassengersController,
    DriversController,
    TrackingController,
    TrackingIngestController,
    FeesController,
  ],
  providers: [
    TransportAccessService,
    TransportAuditService,
    VehiclesService,
    RoutesService,
    PassengersService,
    DriversService,
    TrackingService,
    FeesService,
  ],
})
export class TransportModule {}
