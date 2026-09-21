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
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from '../auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from '../auth/alumni-permissions.guard';
import {
  RequirePermission,
  StaffOnly,
} from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { PageQueryDto } from '../common/page-query.dto';
import { GroupsService } from './groups.service';
import {
  AddGroupMembersDto,
  CreateAlumniGroupDto,
  QueryAlumniGroupDto,
  UpdateAlumniGroupDto,
} from './dto/group.dto';

@ApiTags('Alumni / Groups')
@ApiBearerAuth()
@UseGuards(
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
)
@Controller('api/alumni/groups')
export class GroupsController {
  constructor(private readonly svc: GroupsService) {}

  @Post()
  @StaffOnly()
  @RequirePermission({ resource: 'groups', action: 'create' })
  @ApiOperation({
    summary: 'Create a group (batch / program / location / interest)',
  })
  create(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: CreateAlumniGroupDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'groups', action: 'read' })
  @ApiOperation({ summary: 'List / search groups, filter by type' })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryAlumniGroupDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'groups', action: 'read' })
  @ApiOperation({ summary: 'Get a group with its member count' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @StaffOnly()
  @RequirePermission({ resource: 'groups', action: 'update' })
  @ApiOperation({
    summary: 'Update a group (or reactivate with is_active=true)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAlumniGroupDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @StaffOnly()
  @RequirePermission({ resource: 'groups', action: 'delete' })
  @ApiOperation({ summary: 'Deactivate a group (memberships are kept)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }

  @Get(':id/members')
  @RequirePermission({ resource: 'groups', action: 'read' })
  @ApiOperation({
    summary: 'List group members (alumni only see members they may see)',
  })
  @ApiParam({ name: 'id', example: 1 })
  members(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PageQueryDto,
  ) {
    return this.svc.listMembers(user, id, query);
  }

  @Post(':id/members')
  @StaffOnly()
  @RequirePermission({ resource: 'groups', action: 'manage_members' })
  @ApiOperation({
    summary:
      'Add members in bulk; existing members are skipped (no duplicates)',
  })
  @ApiParam({ name: 'id', example: 1 })
  addMembers(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddGroupMembersDto,
  ) {
    return this.svc.addMembers(user, id, dto);
  }

  @Delete(':id/members/:alumniId')
  @StaffOnly()
  @RequirePermission({ resource: 'groups', action: 'manage_members' })
  @ApiOperation({ summary: 'Remove a member' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiParam({ name: 'alumniId', example: 1 })
  removeMember(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('alumniId', ParseIntPipe) alumniId: number,
  ) {
    return this.svc.removeMember(user, id, alumniId);
  }
}
