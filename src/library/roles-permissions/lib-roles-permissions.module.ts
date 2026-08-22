import { Module } from '@nestjs/common';
import { LibDynamicRolesController } from './lib-dynamic-roles.controller';
import { LibDynamicRolesService } from './lib-dynamic-roles.service';
import { LibPermissionsController } from './lib-permissions.controller';
import { LibPermissionsService } from './lib-permissions.service';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule],
  controllers: [LibDynamicRolesController, LibPermissionsController],
  providers: [LibDynamicRolesService, LibPermissionsService],
  exports: [LibDynamicRolesService, LibPermissionsService],
})
export class LibRolesPermissionsModule {}
