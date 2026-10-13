import { Module } from '@nestjs/common';
import { StaffAuthModule } from './auth/staff-auth.module';
import { StaffRolesPermissionsModule } from './roles-permissions/staff-roles-permissions.module';
import { AccountsCoreModule } from '../accounts/accounts-core.module';

import { StaffAuditService } from './common/staff-audit.service';
import { StaffNumberingService } from './common/staff-numbering.service';

import { DepartmentsController } from './departments/departments.controller';
import { DepartmentsService } from './departments/departments.service';

import { StaffMembersController } from './directory/staff-members.controller';
import { StaffMembersService } from './directory/staff-members.service';

import { LeaveTypesController } from './leave-types/leave-types.controller';
import { LeaveTypesService } from './leave-types/leave-types.service';

import { LeaveBalancesController } from './leave-balances/leave-balances.controller';
import { LeaveBalancesService } from './leave-balances/leave-balances.service';

import { LeaveApplicationsController } from './leave-applications/leave-applications.controller';
import { LeaveApplicationsService } from './leave-applications/leave-applications.service';

import { StaffNotificationsController } from './notifications/staff-notifications.controller';
import { StaffNotificationService } from './notifications/staff-notification.service';

import { StaffLmsSyncService } from './lms-sync/staff-lms-sync.service';
import { LmsTeachersController } from './lms-sync/lms-teachers.controller';

import { SalaryStructuresController } from './payroll/salary-structures.controller';
import { SalaryStructuresService } from './payroll/salary-structures.service';

import { PayrollRunsController } from './payroll/payroll-runs.controller';
import { PayrollRunsService } from './payroll/payroll-runs.service';

import { StaffScheduler } from './scheduler/staff.scheduler';

import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

import { StaffSelfServiceController } from './self-service/staff-self-service.controller';
import { StaffSelfServiceGuard } from './self-service/staff-self-service.guard';

/**
 * Staff Management — a self-contained island, built the same way as every
 * other business module here: own auth (SSO + direct login, own JWT secret),
 * own dynamic RBAC, own tables and own numbering. No foreign keys to, or
 * calls into, any other business module. Teaching vs non-teaching staff share
 * one directory and one RBAC surface, distinguished only by `staff_type`.
 */
@Module({
  imports: [StaffAuthModule, StaffRolesPermissionsModule, AccountsCoreModule],
  controllers: [
    DepartmentsController,
    StaffMembersController,
    LeaveTypesController,
    LeaveBalancesController,
    LeaveApplicationsController,
    StaffNotificationsController,
    LmsTeachersController,
    SalaryStructuresController,
    PayrollRunsController,
    DashboardController,
    StaffSelfServiceController,
  ],
  providers: [
    StaffAuditService,
    StaffNumberingService,
    DepartmentsService,
    StaffMembersService,
    LeaveTypesService,
    LeaveBalancesService,
    LeaveApplicationsService,
    StaffNotificationService,
    StaffLmsSyncService,
    SalaryStructuresService,
    PayrollRunsService,
    StaffScheduler,
    DashboardService,
    StaffSelfServiceGuard,
  ],
  exports: [DashboardService],
})
export class StaffModule {}
