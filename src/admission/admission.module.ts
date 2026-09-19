import { Module } from '@nestjs/common';
import { AdmissionAuthModule } from './auth/admission-auth.module';
import { AdmissionRolesPermissionsModule } from './roles-permissions/admission-roles-permissions.module';

import { AdmissionAuditService } from './common/admission-audit.service';
import { AdmissionLookupService } from './common/admission-lookup.service';
import { AdmissionNumberingService } from './common/admission-numbering.service';
import { AdmissionSeatsService } from './common/admission-seats.service';
import { AdmissionNotificationService } from './notifications/admission-notification.service';
import { AdmissionNotificationsController } from './notifications/admission-notifications.controller';

import { SessionsController } from './sessions/sessions.controller';
import { SessionsService } from './sessions/sessions.service';
import { ProgramsController } from './programs/programs.controller';
import { ProgramsService } from './programs/programs.service';
import { ApplicantsController } from './applicants/applicants.controller';
import { ApplicantsService } from './applicants/applicants.service';
import { EnquiriesController } from './enquiries/enquiries.controller';
import { EnquiriesService } from './enquiries/enquiries.service';
import { ApplicationsController } from './applications/applications.controller';
import { ApplicationsService } from './applications/applications.service';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { ApplicationFeesController } from './application-fees/application-fees.controller';
import { ApplicationFeesService } from './application-fees/application-fees.service';
import { TestsController } from './tests/tests.controller';
import { TestsService } from './tests/tests.service';
import { InterviewsController } from './interviews/interviews.controller';
import { InterviewsService } from './interviews/interviews.service';
import { MeritListsController } from './merit-lists/merit-lists.controller';
import { MeritListsService } from './merit-lists/merit-lists.service';
import {
  ApplicationOffersController,
  OffersController,
} from './offers/offers.controller';
import { OffersService } from './offers/offers.service';
import { OfferExpiryScheduler } from './offers/offer-expiry.scheduler';
import {
  ApplicationPaymentsController,
  FeeStructuresController,
  PaymentsController,
} from './fees/fees.controller';
import { FeeStructuresService } from './fees/fee-structures.service';
import { AdmissionPaymentsService } from './fees/admission-payments.service';
import {
  ApplicationConfirmationController,
  ConfirmationsController,
} from './confirmations/confirmations.controller';
import { ConfirmationsService } from './confirmations/confirmations.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

/**
 * Admission Management — a self-contained island: its own auth (SSO + direct
 * login, own JWT secret), own dynamic RBAC, own tables and own numbering. It
 * shares only the ERP's platform infrastructure (Prisma, the audit log,
 * scheduling) and has no foreign keys to, or calls into, any other business module.
 */
@Module({
  imports: [AdmissionAuthModule, AdmissionRolesPermissionsModule],
  controllers: [
    SessionsController,
    ProgramsController,
    ApplicantsController,
    EnquiriesController,
    ApplicationsController,
    DocumentsController,
    ApplicationFeesController,
    TestsController,
    InterviewsController,
    MeritListsController,
    ApplicationOffersController,
    OffersController,
    FeeStructuresController,
    ApplicationPaymentsController,
    PaymentsController,
    ApplicationConfirmationController,
    ConfirmationsController,
    ReportsController,
    DashboardController,
    AdmissionNotificationsController,
  ],
  providers: [
    AdmissionAuditService,
    AdmissionLookupService,
    AdmissionNumberingService,
    AdmissionSeatsService,
    AdmissionNotificationService,
    SessionsService,
    ProgramsService,
    ApplicantsService,
    EnquiriesService,
    ApplicationsService,
    DocumentsService,
    ApplicationFeesService,
    TestsService,
    InterviewsService,
    MeritListsService,
    OffersService,
    OfferExpiryScheduler,
    FeeStructuresService,
    AdmissionPaymentsService,
    ConfirmationsService,
    ReportsService,
    DashboardService,
  ],
})
export class AdmissionModule {}
