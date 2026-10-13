import { Module } from '@nestjs/common';
import { AccountsCoreModule } from '../accounts/accounts-core.module';

import { StudentFeesAuthService } from './auth/student-fees-auth.service';
import { StudentFeesJwtGuard } from './auth/student-fees-jwt.guard';
import { StudentFeesAuthController } from './auth/student-fees-auth.controller';

import { FeeClassesController } from './classes/fee-classes.controller';
import { FeeClassesService } from './classes/fee-classes.service';

import { FeeStudentsController } from './students/fee-students.controller';
import { FeeStudentsService } from './students/fee-students.service';

import { FeeStructuresController } from './fee-structures/fee-structures.controller';
import { FeeStructuresService } from './fee-structures/fee-structures.service';

import { FeePaymentsController } from './payments/fee-payments.controller';
import { FeePaymentsService } from './payments/fee-payments.service';

import { FeeReportsController } from './reports/fee-reports.controller';
import { FeeReportsService } from './reports/fee-reports.service';

import { FeeNumberingService } from './common/fee-numbering.service';
import { FeeNotificationService } from './notifications/fee-notification.service';

/**
 * Student Fees — class/grade-wise tuition fee tracking for an academic
 * year, built as its own island (own SSO auth, own tables) like every
 * other business module here. v1 scope: admin-only (no dynamic RBAC or
 * direct login yet, no row-locking on payment balance checks) — see the
 * scope notes in student-fees-auth.service.ts and fee-payments.service.ts.
 */
@Module({
  imports: [AccountsCoreModule],
  controllers: [
    StudentFeesAuthController,
    FeeClassesController,
    FeeStudentsController,
    FeeStructuresController,
    FeePaymentsController,
    FeeReportsController,
  ],
  providers: [
    StudentFeesAuthService,
    StudentFeesJwtGuard,
    FeeClassesService,
    FeeStudentsService,
    FeeStructuresService,
    FeePaymentsService,
    FeeReportsService,
    FeeNumberingService,
    FeeNotificationService,
  ],
})
export class StudentFeesModule {}
