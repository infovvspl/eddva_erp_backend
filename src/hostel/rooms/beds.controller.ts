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
import { BedsService } from './beds.service';
import {
  CreateHostelBedDto,
  QueryHostelBedDto,
  UpdateHostelBedDto,
} from './dto/bed.dto';

@ApiTags('Hostel / Beds')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel')
export class BedsController {
  constructor(private readonly svc: BedsService) {}

  @Post('rooms/:roomId/beds')
  @RequirePermission({ resource: 'beds', action: 'create' })
  @ApiOperation({
    summary:
      'Add a bed to a room (optional bed-level tracking; count cannot exceed room capacity)',
  })
  @ApiParam({ name: 'roomId', example: 1 })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: CreateHostelBedDto,
  ) {
    return this.svc.create(user, roomId, dto);
  }

  @Get('rooms/:roomId/beds')
  @RequirePermission({ resource: 'beds', action: 'read' })
  @ApiOperation({ summary: 'Beds of a room' })
  @ApiParam({ name: 'roomId', example: 1 })
  listForRoom(
    @HostelUser() user: HostelPlatformUser,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() query: QueryHostelBedDto,
  ) {
    return this.svc.findAll(user.institute_id, { ...query, room_id: roomId });
  }

  @Get('beds')
  @RequirePermission({ resource: 'beds', action: 'read' })
  @ApiOperation({ summary: 'List beds (filter by room, block, status)' })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelBedDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get('beds/available')
  @RequirePermission({ resource: 'beds', action: 'read' })
  @ApiOperation({ summary: 'Vacant beds' })
  available(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelBedDto,
  ) {
    return this.svc.findAll(user.institute_id, { ...query, status: 'vacant' });
  }

  @Get('beds/occupied')
  @RequirePermission({ resource: 'beds', action: 'read' })
  @ApiOperation({ summary: 'Occupied beds with the current resident' })
  occupied(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelBedDto,
  ) {
    return this.svc.findAll(user.institute_id, {
      ...query,
      status: 'occupied',
    });
  }

  @Get('beds/occupancy')
  @RequirePermission({ resource: 'beds', action: 'read' })
  @ApiOperation({ summary: 'Bed occupancy summary (optionally for one block)' })
  occupancy(
    @HostelUser() user: HostelPlatformUser,
    @Query('block_id') blockId?: string,
  ) {
    return this.svc.occupancy(
      user.institute_id,
      blockId ? Number(blockId) : undefined,
    );
  }

  @Get('beds/:id')
  @RequirePermission({ resource: 'beds', action: 'read' })
  @ApiOperation({ summary: 'Get a bed with its current occupant' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch('beds/:id')
  @RequirePermission({ resource: 'beds', action: 'update' })
  @ApiOperation({ summary: 'Rename a bed (status is derived from allotments)' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHostelBedDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete('beds/:id')
  @RequirePermission({ resource: 'beds', action: 'delete' })
  @ApiOperation({ summary: 'Soft-delete a vacant bed' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }
}
