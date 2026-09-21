import {
  Body,
  Controller,
  Delete,
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
import { AllotmentsService } from '../allotments/allotments.service';
import { RoomsService } from './rooms.service';
import {
  CreateHostelRoomDto,
  QueryHostelRoomDto,
  UpdateHostelRoomDto,
} from './dto/room.dto';

@ApiTags('Hostel / Rooms')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/rooms')
export class RoomsController {
  constructor(
    private readonly svc: RoomsService,
    private readonly allotments: AllotmentsService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'rooms', action: 'create' })
  @ApiOperation({ summary: 'Create a room in a block' })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: CreateHostelRoomDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'rooms', action: 'read' })
  @ApiOperation({
    summary:
      'List/search rooms — filter by block, floor, room type, status, block gender; each row carries occupied/vacant',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelRoomDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(['vacancy', 'available'])
  @RequirePermission({ resource: 'rooms', action: 'read' })
  @ApiOperation({
    summary:
      'Rooms with a free place (available = not full, not under maintenance), with vacant counts',
  })
  vacancy(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelRoomDto,
  ) {
    return this.svc.vacancy(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'rooms', action: 'read' })
  @ApiOperation({ summary: 'Get a room with its block, beds and occupancy' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'rooms', action: 'update' })
  @ApiOperation({
    summary:
      'Update a room; set status to under_maintenance/available. Capacity cannot drop below current occupancy',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHostelRoomDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'rooms', action: 'delete' })
  @ApiOperation({ summary: 'Soft-delete a room with no current residents' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }

  @Get(':id/occupancy')
  @RequirePermission({ resource: 'rooms', action: 'read' })
  @ApiOperation({ summary: 'Room occupancy: capacity, occupied, vacant, beds' })
  @ApiParam({ name: 'id', example: 1 })
  occupancy(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.occupancyOf(user.institute_id, id);
  }

  @Get(':id/residents')
  @RequirePermission({ resource: 'residents', action: 'read' })
  @ApiOperation({ summary: 'Residents currently living in the room' })
  @ApiParam({ name: 'id', example: 1 })
  residents(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.currentResidents(user.institute_id, id);
  }

  @Get(':id/allotment-history')
  @RequirePermission({ resource: 'allotments', action: 'read' })
  @ApiOperation({
    summary:
      'Every stay ever recorded in this room (active, vacated and transferred), newest first',
  })
  @ApiParam({ name: 'id', example: 1 })
  allotmentHistory(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PageQueryDto,
  ) {
    return this.allotments.roomHistory(user.institute_id, id, query);
  }
}
