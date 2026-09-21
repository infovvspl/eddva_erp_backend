import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { GatePassesService } from './gate-passes.service';
import {
  ApproveGatePassDto,
  CreateGatePassDto,
  GateScanByNumberDto,
  GateScanDto,
  QueryGatePassDto,
  RejectGatePassDto,
} from './dto/gate-pass.dto';

@ApiTags('Hostel / Gate Passes')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/gate-passes')
export class GatePassesController {
  constructor(private readonly svc: GatePassesService) {}

  @Post()
  @RequirePermission({ resource: 'gate_passes', action: 'create' })
  @ApiOperation({
    summary:
      'Request a gate pass (pending). Rejected if the resident is inactive or already has a conflicting/open pass',
  })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: CreateGatePassDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'gate_passes', action: 'read' })
  @ApiOperation({
    summary:
      'List gate passes — filter by status, type, resident, block, requested-out date range; search pass no / name / destination',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryGatePassDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get('pending')
  @RequirePermission({ resource: 'gate_passes', action: 'read' })
  @ApiOperation({ summary: 'Passes waiting for approval, oldest first' })
  pending(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryGatePassDto,
  ) {
    return this.svc.pending(user.institute_id, query);
  }

  @Get('out')
  @RequirePermission({ resource: 'gate_passes', action: 'read' })
  @ApiOperation({
    summary: 'Residents currently outside (status out or overdue)',
  })
  out(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryGatePassDto,
  ) {
    return this.svc.outNow(user.institute_id, query);
  }

  @Get('overdue')
  @RequirePermission({ resource: 'gate_passes', action: 'read' })
  @ApiOperation({
    summary:
      'Overdue passes: return time has passed and the resident has not been scanned in (computed live, so it is correct even between sweeps)',
  })
  overdue(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryGatePassDto,
  ) {
    return this.svc.overdue(user.institute_id, query);
  }

  @Get('today')
  @RequirePermission({ resource: 'gate_passes', action: 'read' })
  @ApiOperation({ summary: "Today's passes: leaving, due back or moved today" })
  today(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryGatePassDto,
  ) {
    return this.svc.today(user.institute_id, query);
  }

  @Get('resident/:residentId')
  @RequirePermission({ resource: 'gate_passes', action: 'read' })
  @ApiOperation({ summary: 'Gate pass history of one resident' })
  @ApiParam({ name: 'residentId', example: 1 })
  residentHistory(
    @HostelUser() user: HostelPlatformUser,
    @Param('residentId', ParseIntPipe) residentId: number,
    @Query() query: QueryGatePassDto,
  ) {
    return this.svc.residentHistory(user.institute_id, residentId, query);
  }

  @Post('scan-out')
  @RequirePermission({ resource: 'gate_passes', action: 'scan' })
  @ApiOperation({
    summary: 'Gate scan-out by pass number (what a QR/barcode reader sends)',
  })
  scanOutByNumber(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: GateScanByNumberDto,
  ) {
    return this.svc.scanOutByNumber(user, dto.pass_no, dto);
  }

  @Post('scan-in')
  @RequirePermission({ resource: 'gate_passes', action: 'scan' })
  @ApiOperation({ summary: 'Gate scan-in by pass number' })
  scanInByNumber(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: GateScanByNumberDto,
  ) {
    return this.svc.scanInByNumber(user, dto.pass_no, dto);
  }

  @Get(':id')
  @RequirePermission({ resource: 'gate_passes', action: 'read' })
  @ApiOperation({ summary: 'Get a gate pass' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Post(':id/approve')
  @RequirePermission({ resource: 'gate_passes', action: 'approve' })
  @ApiOperation({ summary: 'Approve a pending pass' })
  @ApiParam({ name: 'id', example: 1 })
  approve(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveGatePassDto,
  ) {
    return this.svc.approve(user, id, dto.remarks);
  }

  @Post(':id/reject')
  @RequirePermission({ resource: 'gate_passes', action: 'approve' })
  @ApiOperation({ summary: 'Reject a pending pass (remarks required)' })
  @ApiParam({ name: 'id', example: 1 })
  reject(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectGatePassDto,
  ) {
    return this.svc.reject(user, id, dto.remarks);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'gate_passes', action: 'cancel' })
  @ApiOperation({
    summary: 'Cancel a pending or approved pass that has not been used',
  })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveGatePassDto,
  ) {
    return this.svc.cancel(user, id, dto.remarks);
  }

  @Post(':id/scan-out')
  @RequirePermission({ resource: 'gate_passes', action: 'scan' })
  @ApiOperation({
    summary:
      'Gate-verified exit: only an approved, in-window pass of an active resident, exactly once. Optional resident_id/admission_no proves the pass belongs to the person at the gate',
  })
  @ApiParam({ name: 'id', example: 1 })
  scanOut(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GateScanDto,
  ) {
    return this.svc.scanOut(user, id, dto);
  }

  @Post(':id/scan-in')
  @RequirePermission({ resource: 'gate_passes', action: 'scan' })
  @ApiOperation({
    summary:
      'Gate-verified return: only for a resident who was scanned out on this pass. Reports how late they are',
  })
  @ApiParam({ name: 'id', example: 1 })
  scanIn(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GateScanDto,
  ) {
    return this.svc.scanIn(user, id, dto);
  }
}
