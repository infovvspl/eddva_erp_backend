import { Module } from '@nestjs/common';
import { LibCategoriesModule } from './categories/lib-categories.module';
import { LibMembersModule } from './members/lib-members.module';
import { LibMembershipRulesModule } from './membership-rules/lib-membership-rules.module';
import { LibCatalogModule } from './catalog/lib-catalog.module';
import { LibCopiesModule } from './copies/lib-copies.module';
import { LibBookVendorsModule } from './book-vendors/lib-book-vendors.module';
import { LibIssuesModule } from './issues/lib-issues.module';
import { LibReservationsModule } from './reservations/lib-reservations.module';
import { LibFinesModule } from './fines/lib-fines.module';
import { LibNotificationsModule } from './notifications/lib-notifications.module';
import { LibSchedulerModule } from './scheduler/lib-scheduler.module';
import { LibAuthModule } from './auth/lib-auth.module';
import { LibRolesPermissionsModule } from './roles-permissions/lib-roles-permissions.module';

@Module({
  imports: [
    LibAuthModule,
    LibRolesPermissionsModule,
    LibCategoriesModule,
    LibMembershipRulesModule,
    LibNotificationsModule,
    LibMembersModule,
    LibCatalogModule,
    LibCopiesModule,
    LibBookVendorsModule,
    LibFinesModule,
    LibReservationsModule,
    LibIssuesModule,
    LibSchedulerModule,
  ],
})
export class LibraryModule {}
