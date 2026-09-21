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
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { PageQueryDto } from '../common/page-query.dto';
import { ResidentsService } from './residents.service';
import { AllotmentsService } from '../allotments/allotments.service';
import { TransferRequestsService } from '../allotments/transfer-requests.service';
import {
  CreateAllotmentDto,
  CreateTransferRequestDto,
  QueryTransferRequestDto,
  TransferResidentDto,
  VacateResidentDto,
} from '../allotments/dto/allotment.dto';
import {
  CreateHostelResidentDto,
  QueryHostelResidentDto,
  ReadmitResidentDto,
  ReinstateResidentDto,
  SuspendResidentDto,
  UpdateHostelResidentDto,
} from './dto/resident.dto';

@ApiTags('Hostel / Residents & Allotment')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/residents')
export class ResidentsController {
  constructor(
    private readonly svc: ResidentsService,
    private readonly allotments: AllotmentsService,
    private readonly transfers: TransferRequestsService,
  ) {}

  // ─── Residents ────────────────────────────────────────────────────────────

  @Post()
  @RequirePermission({ resource: 'residents', action: 'create' })
  @ApiOperation({
    summary:
      'Register a student as a hostel resident (links to the school student record via student_ref)',
  })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: CreateHostelResidentDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'residents', action: 'read' })
  @ApiOperation({
    summary:
      'List/search residents — filter by status, gender, block, room, academic year, or unallotted only',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelResidentDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'residents', action: 'read' })
  @ApiOperation({ summary: 'Get a resident with their current allotment' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'residents', action: 'update' })
  @ApiOperation({
    summary: 'Update resident/guardian details (student_ref is fixed)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHostelResidentDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/suspend')
  @RequirePermission({ resource: 'residents', action: 'suspend' })
  @ApiOperation({
    summary:
      'Suspend an active resident (unused pending/approved gate passes are cancelled)',
  })
  @ApiParam({ name: 'id', example: 1 })
  suspend(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuspendResidentDto,
  ) {
    return this.svc.suspend(user, id, dto.reason);
  }

  @Post(':id/reinstate')
  @RequirePermission({ resource: 'residents', action: 'suspend' })
  @ApiOperation({ summary: 'Reinstate a suspended resident' })
  @ApiParam({ name: 'id', example: 1 })
  reinstate(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReinstateResidentDto,
  ) {
    return this.svc.reinstate(user, id, dto.remarks);
  }

  @Post(':id/readmit')
  @RequirePermission({ resource: 'residents', action: 'update' })
  @ApiOperation({
    summary: 'Re-admit a vacated resident (keeps their history)',
  })
  @ApiParam({ name: 'id', example: 1 })
  readmit(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReadmitResidentDto,
  ) {
    return this.svc.readmit(user, id, dto.admitted_on);
  }

  // ─── Allotment ────────────────────────────────────────────────────────────

  @Post(':id/allotment')
  @RequirePermission({ resource: 'allotments', action: 'create' })
  @ApiOperation({
    summary:
      'Allot a room (and bed where the room tracks beds). Enforces one active allotment, capacity, bed availability, maintenance and gender rules',
  })
  @ApiParam({ name: 'id', example: 1 })
  allot(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAllotmentDto,
  ) {
    return this.allotments.create(user, id, dto);
  }

  @Get(':id/allotment')
  @RequirePermission({ resource: 'allotments', action: 'read' })
  @ApiOperation({
    summary: 'Current (active) allotment of the resident, or null',
  })
  @ApiParam({ name: 'id', example: 1 })
  currentAllotment(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.allotments.current(user.institute_id, id);
  }

  @Get(':id/allotment-history')
  @RequirePermission({ resource: 'allotments', action: 'read' })
  @ApiOperation({
    summary:
      'Every stay of the resident (active, vacated, transferred), newest first',
  })
  @ApiParam({ name: 'id', example: 1 })
  allotmentHistory(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PageQueryDto,
  ) {
    return this.allotments.history(user.institute_id, id, query);
  }

  @Post(':id/vacate')
  @RequirePermission({ resource: 'allotments', action: 'vacate' })
  @ApiOperation({
    summary:
      'Vacate the resident: closes the active allotment (kept as history), frees the bed, marks the resident vacated. Refused while the resident is out on a gate pass',
  })
  @ApiParam({ name: 'id', example: 1 })
  vacate(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VacateResidentDto,
  ) {
    return this.allotments.vacate(user, id, dto);
  }

  @Post(':id/transfer')
  @RequirePermission({ resource: 'allotments', action: 'transfer' })
  @ApiOperation({
    summary:
      'Direct transfer to another room/bed: closes the current allotment as `transferred` and opens a new one, atomically',
  })
  @ApiParam({ name: 'id', example: 1 })
  transfer(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferResidentDto,
  ) {
    return this.allotments.transfer(user, id, dto);
  }

  @Post(':id/transfer-request')
  @RequirePermission({ resource: 'transfer_requests', action: 'create' })
  @ApiOperation({ summary: 'Raise a room transfer request for approval' })
  @ApiParam({ name: 'id', example: 1 })
  requestTransfer(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTransferRequestDto,
  ) {
    return this.transfers.create(user, id, dto);
  }

  @Get(':id/transfer-history')
  @RequirePermission({ resource: 'transfer_requests', action: 'read' })
  @ApiOperation({
    summary: 'All transfer requests of the resident and their outcomes',
  })
  @ApiParam({ name: 'id', example: 1 })
  transferHistory(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryTransferRequestDto,
  ) {
    return this.transfers.findAll(user.institute_id, {
      ...query,
      resident_id: id,
    });
  }
}
