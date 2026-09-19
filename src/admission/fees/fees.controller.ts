import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { FeeStructuresService } from './fee-structures.service';
import { AdmissionPaymentsService } from './admission-payments.service';
import {
  CreateFeeStructureDto,
  PayAdmissionFeeDto,
  QueryAdmissionPaymentDto,
  QueryFeeStructureDto,
  UpdateFeeStructureDto,
} from './dto/fee.dto';

const GUARDS = [
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
] as const;

@ApiTags('Admission / Admission Fee Structure')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/admission/fee-structures')
export class FeeStructuresController {
  constructor(private readonly svc: FeeStructuresService) {}

  @Post()
  @RequirePermission({ resource: 'fee_structures', action: 'create' })
  @ApiOperation({
    summary: 'Configure the admission fee for a program + session',
  })
  create(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: CreateFeeStructureDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'fee_structures', action: 'read' })
  @ApiOperation({ summary: 'List fee structures' })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryFeeStructureDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'fee_structures', action: 'read' })
  @ApiOperation({ summary: 'Get a fee structure' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'fee_structures', action: 'update' })
  @ApiOperation({ summary: 'Update the amount / due date of a fee structure' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeeStructureDto,
  ) {
    return this.svc.update(user, id, dto);
  }
}

@ApiTags('Admission / Admission Fee Payments')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/admission/applications/:applicationId')
export class ApplicationPaymentsController {
  constructor(private readonly svc: AdmissionPaymentsService) {}

  @Post('pay-admission-fee')
  @RequirePermission({ resource: 'admission_payments', action: 'record' })
  @ApiOperation({
    summary:
      'Record an admission-fee payment and issue its receipt number. Requires an accepted offer; never exceeds the configured fee; supports idempotency_key',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  record(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Body() dto: PayAdmissionFeeDto,
  ) {
    return this.svc.record(user, applicationId, dto);
  }

  @Get('admission-payments')
  @RequirePermission({ resource: 'admission_payments', action: 'read' })
  @ApiOperation({
    summary:
      'Admission payments and fee position (required / paid / balance) for an application',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  list(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    return this.svc.listForApplication(user.institute_id, applicationId);
  }
}

@ApiTags('Admission / Admission Fee Payments')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/admission/payments')
export class PaymentsController {
  constructor(private readonly svc: AdmissionPaymentsService) {}

  @Get()
  @RequirePermission({ resource: 'admission_payments', action: 'read' })
  @ApiOperation({
    summary:
      'List admission payments with receipt numbers (search, filters, pagination)',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryAdmissionPaymentDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'admission_payments', action: 'read' })
  @ApiOperation({ summary: 'Payment receipt details' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }
}
