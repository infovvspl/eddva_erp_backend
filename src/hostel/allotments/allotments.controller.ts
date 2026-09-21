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
import { AllotmentsService } from './allotments.service';
import { TransferRequestsService } from './transfer-requests.service';
import {
  ApproveTransferRequestDto,
  QueryAllotmentDto,
  QueryTransferRequestDto,
  RejectTransferRequestDto,
} from './dto/allotment.dto';

@ApiTags('Hostel / Allotments')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/allotments')
export class AllotmentsController {
  constructor(private readonly svc: AllotmentsService) {}

  @Get()
  @RequirePermission({ resource: 'allotments', action: 'read' })
  @ApiOperation({
    summary:
      'List allotments — filter by resident, room, block, academic year, status and allotment date range',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryAllotmentDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'allotments', action: 'read' })
  @ApiOperation({ summary: 'Get an allotment' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }
}

@ApiTags('Hostel / Transfer Requests')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/transfer-requests')
export class TransferRequestsController {
  constructor(private readonly svc: TransferRequestsService) {}

  @Get()
  @RequirePermission({ resource: 'transfer_requests', action: 'read' })
  @ApiOperation({
    summary: 'List transfer requests (status, resident, rooms, date range)',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryTransferRequestDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'transfer_requests', action: 'read' })
  @ApiOperation({ summary: 'Get a transfer request' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Post(':id/approve')
  @RequirePermission({ resource: 'transfer_requests', action: 'approve' })
  @ApiOperation({
    summary:
      'Approve: validates room/bed/capacity, closes the current allotment as transferred and opens the new one — one transaction',
  })
  @ApiParam({ name: 'id', example: 1 })
  approve(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveTransferRequestDto,
  ) {
    return this.svc.approve(user, id, dto);
  }

  @Post(':id/reject')
  @RequirePermission({ resource: 'transfer_requests', action: 'approve' })
  @ApiOperation({ summary: 'Reject a pending request (remarks required)' })
  @ApiParam({ name: 'id', example: 1 })
  reject(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectTransferRequestDto,
  ) {
    return this.svc.reject(user, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'transfer_requests', action: 'cancel' })
  @ApiOperation({ summary: 'Cancel a pending request' })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.cancel(user, id);
  }
}
