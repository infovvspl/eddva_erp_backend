import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { ApplicationFeesService } from './application-fees.service';
import {
  PayApplicationFeeDto,
  UpdateApplicationFeePaymentDto,
} from './dto/application-fee.dto';

@ApiTags('Admission / Application Fee')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/applications/:applicationId')
export class ApplicationFeesController {
  constructor(private readonly svc: ApplicationFeesService) {}

  @Post('pay-application-fee')
  @RequirePermission({ resource: 'application_fees', action: 'create' })
  @ApiOperation({
    summary:
      'Record an application-fee payment (separate from the admission fee). Supports an idempotency_key',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  record(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Body() dto: PayApplicationFeeDto,
  ) {
    return this.svc.record(user, applicationId, dto);
  }

  @Get('application-fee-payments')
  @RequirePermission({ resource: 'application_fees', action: 'read' })
  @ApiOperation({ summary: 'Application-fee payments and paid status' })
  @ApiParam({ name: 'applicationId', example: 1 })
  list(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    return this.svc.list(user.institute_id, applicationId);
  }

  @Patch('application-fee-payments/:paymentId')
  @RequirePermission({ resource: 'application_fees', action: 'update' })
  @ApiOperation({
    summary: 'Settle a pending application-fee payment to success or failed',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  @ApiParam({ name: 'paymentId', example: 1 })
  settle(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() dto: UpdateApplicationFeePaymentDto,
  ) {
    return this.svc.settle(user, applicationId, paymentId, dto);
  }
}
