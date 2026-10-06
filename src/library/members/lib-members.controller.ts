import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { LibMembersService } from './lib-members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { LibUser } from '../auth/lib-user.decorator';
import type { LibPlatformUser } from '../auth/lib-auth.service';

@ApiTags('Library / Members')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/members')
export class LibMembersController {
  constructor(private readonly membersService: LibMembersService) {}

  @Post()
  @RequirePermission({ resource: 'members', action: 'create' })
  @ApiOperation({ summary: 'Register new library member (admin)' })
  create(@LibUser() user: LibPlatformUser, @Body() dto: CreateMemberDto) {
    return this.membersService.create(user.institute_id, dto);
  }

  @Get()
  @RequirePermission({ resource: 'members', action: 'read' })
  @ApiOperation({ summary: 'List members (paginated, filterable by type/status)' })
  findAll(@LibUser() user: LibPlatformUser, @Query() query: MemberQueryDto) {
    return this.membersService.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'members', action: 'read' })
  @ApiOperation({ summary: 'Get member detail' })
  @ApiParam({ name: 'id', description: 'member_id of the Library Member (e.g. 1)' })
  findOne(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.membersService.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'members', action: 'update' })
  @ApiOperation({ summary: 'Update member (admin)' })
  @ApiParam({ name: 'id', description: 'member_id of the Library Member to update (e.g. 1)' })
  update(
    @LibUser() user: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.update(user.institute_id, id, dto);
  }

  @Get(':id/current-issues')
  @RequirePermission({ resource: 'members', action: 'read' })
  @ApiOperation({ summary: 'Get active borrows for a member' })
  @ApiParam({ name: 'id', description: 'member_id of the Library Member (e.g. 1)' })
  getCurrentIssues(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.membersService.getCurrentIssues(user.institute_id, id);
  }

  @Get(':id/fines')
  @RequirePermission({ resource: 'members', action: 'read' })
  @ApiOperation({ summary: 'Get fine history for a member' })
  @ApiParam({ name: 'id', description: 'member_id of the Library Member (e.g. 1)' })
  getFines(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.membersService.getFines(user.institute_id, id);
  }
}
