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
import { VisitorsService } from './visitors.service';
import { CreateVisitorLogDto, QueryVisitorLogDto } from './dto/visitor.dto';

@ApiTags('Hostel / Visitors')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/visitors')
export class VisitorsController {
  constructor(private readonly svc: VisitorsService) {}

  @Post()
  @RequirePermission({ resource: 'visitors', action: 'create' })
  @ApiOperation({
    summary:
      'Log a visitor arriving for a resident. The ID proof number is stored encrypted',
  })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: CreateVisitorLogDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({
    summary:
      'List visitor logs (resident, date range, active). ID proof is masked unless the caller holds visitors:view_id',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryVisitorLogDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get('active')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'Visitors currently inside (not checked out)' })
  active(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryVisitorLogDto,
  ) {
    return this.svc.active(user, query);
  }

  @Get('today')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: "Today's visitors" })
  today(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryVisitorLogDto,
  ) {
    return this.svc.today(user, query);
  }

  @Get('resident/:residentId')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'Visitor history of one resident' })
  @ApiParam({ name: 'residentId', example: 1 })
  residentHistory(
    @HostelUser() user: HostelPlatformUser,
    @Param('residentId', ParseIntPipe) residentId: number,
    @Query() query: QueryVisitorLogDto,
  ) {
    return this.svc.residentHistory(user, residentId, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'Get a visitor log' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Post(':id/checkout')
  @RequirePermission({ resource: 'visitors', action: 'checkout' })
  @ApiOperation({ summary: 'Check a visitor out (once)' })
  @ApiParam({ name: 'id', example: 1 })
  checkout(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.checkout(user, id);
  }
}
