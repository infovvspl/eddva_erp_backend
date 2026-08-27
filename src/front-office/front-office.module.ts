import { Module } from '@nestjs/common';
import { FrontOfficeAuthModule } from './auth/front-office-auth.module';
import { FrontOfficeRolesPermissionsModule } from './roles-permissions/front-office-roles-permissions.module';
import { FrontOfficeAccessService } from './common/front-office-access.service';
import { FrontOfficeAuditService } from './common/front-office-audit.service';
import { FrontOfficeNotificationService } from './notifications/front-office-notification.service';
import { FrontOfficeNotificationsController } from './notifications/front-office-notifications.controller';
import { DepartmentsController } from './departments/departments.controller';
import { DepartmentsService } from './departments/departments.service';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { VisitorsController } from './visitors/visitors.controller';
import { VisitorsService } from './visitors/visitors.service';
import { VisitorLogsController } from './visitors/visitor-logs.controller';
import { VisitorLogsService } from './visitors/visitor-logs.service';
import { KioskController } from './kiosk/kiosk.controller';
import { EnquiriesController } from './enquiries/enquiries.controller';
import { EnquiriesService } from './enquiries/enquiries.service';
import { AppointmentsController } from './appointments/appointments.controller';
import { AppointmentsService } from './appointments/appointments.service';
import { ComplaintsController } from './complaints/complaints.controller';
import { ComplaintsService } from './complaints/complaints.service';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

@Module({
  imports: [FrontOfficeAuthModule, FrontOfficeRolesPermissionsModule],
  controllers: [
    FrontOfficeNotificationsController,
    DepartmentsController,
    EmployeesController,
    VisitorsController,
    VisitorLogsController,
    KioskController,
    EnquiriesController,
    AppointmentsController,
    ComplaintsController,
    AttachmentsController,
    DashboardController,
  ],
  providers: [
    FrontOfficeAccessService,
    FrontOfficeAuditService,
    FrontOfficeNotificationService,
    DepartmentsService,
    EmployeesService,
    VisitorsService,
    VisitorLogsService,
    EnquiriesService,
    AppointmentsService,
    ComplaintsService,
    AttachmentsService,
    DashboardService,
  ],
})
export class FrontOfficeModule {}
