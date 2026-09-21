import { Module } from '@nestjs/common';
import { HostelAuthModule } from './auth/hostel-auth.module';
import { HostelRolesPermissionsModule } from './roles-permissions/hostel-roles-permissions.module';

import { HostelAuditService } from './common/hostel-audit.service';
import { HostelLookupService } from './common/hostel-lookup.service';
import { HostelNumberingService } from './common/hostel-numbering.service';
import { HostelOccupancyService } from './common/hostel-occupancy.service';
import { HostelOccupancyStatsService } from './common/hostel-occupancy-stats.service';
import { HostelNotificationService } from './notifications/hostel-notification.service';
import { HostelNotificationsController } from './notifications/hostel-notifications.controller';

import { BlocksController } from './blocks/blocks.controller';
import { BlocksService } from './blocks/blocks.service';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';
import { BedsController } from './rooms/beds.controller';
import { BedsService } from './rooms/beds.service';
import { ResidentsController } from './residents/residents.controller';
import { ResidentsService } from './residents/residents.service';
import {
  AllotmentsController,
  TransferRequestsController,
} from './allotments/allotments.controller';
import { AllotmentsService } from './allotments/allotments.service';
import { TransferRequestsService } from './allotments/transfer-requests.service';
import { GatePassesController } from './gate-passes/gate-passes.controller';
import { GatePassesService } from './gate-passes/gate-passes.service';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { VisitorsController } from './visitors/visitors.controller';
import { VisitorsService } from './visitors/visitors.service';
import {
  MessAttendanceController,
  MessMenuController,
} from './mess/mess.controller';
import { MessMenuService } from './mess/mess-menu.service';
import { MessAttendanceService } from './mess/mess-attendance.service';
import { ComplaintsController } from './complaints/complaints.controller';
import { ComplaintsService } from './complaints/complaints.service';
import {
  FeePlansController,
  InvoicesController,
  PaymentsController,
} from './fees/fees.controller';
import { FeePlansService } from './fees/fee-plans.service';
import { InvoicesService } from './fees/invoices.service';
import { PaymentsService } from './fees/payments.service';
import { DisciplineController } from './discipline/discipline.controller';
import { DisciplineService } from './discipline/discipline.service';
import { AlertsController } from './alerts/alerts.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { HostelScheduler } from './scheduler/hostel.scheduler';

/**
 * Hostel Management — a self-contained island, built the same way as
 * Admission / Front Office / Canteen: its own auth (SSO + direct login, own
 * JWT secret), own dynamic RBAC, own tables and own numbering. It shares only
 * the ERP's platform infrastructure (Prisma, the audit log, @nestjs/schedule)
 * and has no foreign keys to, or calls into, any other business module.
 */
@Module({
  imports: [HostelAuthModule, HostelRolesPermissionsModule],
  controllers: [
    BlocksController,
    RoomsController,
    BedsController,
    ResidentsController,
    AllotmentsController,
    TransferRequestsController,
    GatePassesController,
    AttendanceController,
    VisitorsController,
    MessMenuController,
    MessAttendanceController,
    ComplaintsController,
    FeePlansController,
    InvoicesController,
    PaymentsController,
    DisciplineController,
    AlertsController,
    DashboardController,
    ReportsController,
    HostelNotificationsController,
  ],
  providers: [
    HostelAuditService,
    HostelLookupService,
    HostelNumberingService,
    HostelOccupancyService,
    HostelOccupancyStatsService,
    HostelNotificationService,
    BlocksService,
    RoomsService,
    BedsService,
    ResidentsService,
    AllotmentsService,
    TransferRequestsService,
    GatePassesService,
    AttendanceService,
    VisitorsService,
    MessMenuService,
    MessAttendanceService,
    ComplaintsService,
    FeePlansService,
    InvoicesService,
    PaymentsService,
    DisciplineService,
    DashboardService,
    ReportsService,
    HostelScheduler,
  ],
})
export class HostelModule {}
