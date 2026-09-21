import { Module } from '@nestjs/common';
import { AlumniAuthModule } from './auth/alumni-auth.module';
import { AlumniRolesPermissionsModule } from './roles-permissions/alumni-roles-permissions.module';

import { AlumniLookupService } from './common/alumni-lookup.service';
import { AlumniNumberingService } from './common/alumni-numbering.service';
import { AlumniFileStorageService } from './common/alumni-file-storage.service';
import { AlumniNotificationsController } from './notifications/alumni-notifications.controller';

import {
  AlumniMeController,
  AlumniProfilesController,
  PublicDirectoryController,
} from './directory/alumni.controller';
import { AlumniService } from './directory/alumni.service';
import { EmploymentController } from './directory/employment.controller';
import { EmploymentService } from './directory/employment.service';
import { GroupsController } from './directory/groups.controller';
import { GroupsService } from './directory/groups.service';
import {
  EventRegistrationsController,
  EventsController,
} from './events/events.controller';
import { EventsService } from './events/events.service';
import { RegistrationsService } from './events/registrations.service';
import { EventPaymentsService } from './events/event-payments.service';
import {
  JobApplicationsController,
  JobsController,
} from './jobs/jobs.controller';
import { JobsService } from './jobs/jobs.service';
import { ApplicationsService } from './jobs/applications.service';
import {
  MentorsController,
  MentorshipMatchesController,
  MentorshipProgramsController,
} from './mentorship/mentorship.controller';
import { ProgramsService } from './mentorship/programs.service';
import { MentorsService } from './mentorship/mentors.service';
import { MatchesService } from './mentorship/matches.service';
import {
  CampaignsController,
  DonationsController,
  DonorHistoryController,
} from './fundraising/fundraising.controller';
import { CampaignsService } from './fundraising/campaigns.service';
import { DonationsService } from './fundraising/donations.service';
import {
  CommunicationLogsController,
  NewslettersController,
} from './communication/communication.controller';
import { NewslettersService } from './communication/newsletters.service';
import { CommunicationLogsService } from './communication/communication-logs.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { AlumniScheduler } from './scheduler/alumni.scheduler';

/**
 * Alumni Management — a self-contained island, built the same way as
 * Admission / Hostel / Front Office / Canteen: its own auth (SSO + direct login
 * + alumni self-registration, own JWT secret), own dynamic RBAC, own tables and
 * own numbering. It shares only the ERP's platform infrastructure (Prisma, the
 * audit log, PdfService for receipts, @nestjs/schedule) and has no foreign keys
 * to, or calls into, any other business module. The alumni profile is the anchor
 * entity every other alumni table references; `student_ref` is the external link
 * to the school's student record (no Student master exists in this backend).
 */
@Module({
  imports: [AlumniAuthModule, AlumniRolesPermissionsModule],
  controllers: [
    PublicDirectoryController,
    AlumniProfilesController,
    AlumniMeController,
    EmploymentController,
    GroupsController,
    EventsController,
    EventRegistrationsController,
    JobsController,
    JobApplicationsController,
    MentorshipProgramsController,
    MentorsController,
    MentorshipMatchesController,
    CampaignsController,
    DonationsController,
    DonorHistoryController,
    NewslettersController,
    CommunicationLogsController,
    DashboardController,
    ReportsController,
    AlumniNotificationsController,
  ],
  providers: [
    AlumniLookupService,
    AlumniNumberingService,
    AlumniFileStorageService,
    AlumniService,
    EmploymentService,
    GroupsService,
    EventsService,
    RegistrationsService,
    EventPaymentsService,
    JobsService,
    ApplicationsService,
    ProgramsService,
    MentorsService,
    MatchesService,
    CampaignsService,
    DonationsService,
    NewslettersService,
    CommunicationLogsService,
    DashboardService,
    ReportsService,
    AlumniScheduler,
  ],
})
export class AlumniModule {}
