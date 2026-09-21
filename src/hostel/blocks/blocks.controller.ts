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
import { BlocksService } from './blocks.service';
import { RoomsService } from '../rooms/rooms.service';
import { QueryHostelRoomDto } from '../rooms/dto/room.dto';
import {
  AssignWardenDto,
  CreateHostelBlockDto,
  QueryHostelBlockDto,
  UpdateHostelBlockDto,
} from './dto/block.dto';

@ApiTags('Hostel / Blocks')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/blocks')
export class BlocksController {
  constructor(
    private readonly svc: BlocksService,
    private readonly rooms: RoomsService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'blocks', action: 'create' })
  @ApiOperation({ summary: 'Create a hostel block' })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: CreateHostelBlockDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'blocks', action: 'read' })
  @ApiOperation({
    summary: 'List/search/filter hostel blocks (gender type, active, warden)',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelBlockDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'blocks', action: 'read' })
  @ApiOperation({ summary: 'Get a hostel block' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'blocks', action: 'update' })
  @ApiOperation({ summary: 'Update a block (also activates/deactivates it)' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHostelBlockDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/assign-warden')
  @RequirePermission({ resource: 'blocks', action: 'update' })
  @ApiOperation({
    summary:
      'Assign (or clear) the primary warden — must be an active hostel staff member',
  })
  @ApiParam({ name: 'id', example: 1 })
  assignWarden(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignWardenDto,
  ) {
    return this.svc.assignWarden(user, id, dto.warden_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'blocks', action: 'delete' })
  @ApiOperation({ summary: 'Soft-delete a block that has no rooms' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }

  @Get(':id/occupancy')
  @RequirePermission({ resource: 'blocks', action: 'read' })
  @ApiOperation({
    summary:
      'Block occupancy: capacity, occupied, vacant, occupancy %, room status counts, beds, per-floor breakdown',
  })
  @ApiParam({ name: 'id', example: 1 })
  occupancy(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.occupancy(user.institute_id, id);
  }

  @Get(':id/rooms')
  @RequirePermission({ resource: 'rooms', action: 'read' })
  @ApiOperation({ summary: 'Rooms in a block (same filters as GET /rooms)' })
  @ApiParam({ name: 'id', example: 1 })
  async listRooms(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryHostelRoomDto,
  ) {
    await this.svc.findOne(user.institute_id, id);
    return this.rooms.findAll(user.institute_id, { ...query, block_id: id });
  }

  @Get(':id/residents')
  @RequirePermission({ resource: 'residents', action: 'read' })
  @ApiOperation({ summary: 'Current residents of a block (active allotments)' })
  @ApiParam({ name: 'id', example: 1 })
  residents(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryHostelBlockDto,
  ) {
    return this.svc.residents(user.institute_id, id, query);
  }
}
