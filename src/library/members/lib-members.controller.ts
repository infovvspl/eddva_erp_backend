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

@ApiTags('Library / Members')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/members')
export class LibMembersController {
  constructor(private readonly membersService: LibMembersService) {}

  @Post()
  @RequirePermission({ resource: 'members', action: 'create' })
  @ApiOperation({ summary: 'Register new library member (admin)' })
  create(@Body() dto: CreateMemberDto) {
    return this.membersService.create(dto);
  }

  @Get()
  @RequirePermission({ resource: 'members', action: 'read' })
  @ApiOperation({ summary: 'List members (paginated, filterable by type/status)' })
  findAll(@Query() query: MemberQueryDto) {
    return this.membersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'members', action: 'read' })
  @ApiOperation({ summary: 'Get member detail' })
  @ApiParam({ name: 'id', description: 'member_id of the Library Member (e.g. 1)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.membersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'members', action: 'update' })
  @ApiOperation({ summary: 'Update member (admin)' })
  @ApiParam({ name: 'id', description: 'member_id of the Library Member to update (e.g. 1)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.update(id, dto);
  }

  @Get(':id/current-issues')
  @RequirePermission({ resource: 'members', action: 'read' })
  @ApiOperation({ summary: 'Get active borrows for a member' })
  @ApiParam({ name: 'id', description: 'member_id of the Library Member (e.g. 1)' })
  getCurrentIssues(@Param('id', ParseIntPipe) id: number) {
    return this.membersService.getCurrentIssues(id);
  }

  @Get(':id/fines')
  @RequirePermission({ resource: 'members', action: 'read' })
  @ApiOperation({ summary: 'Get fine history for a member' })
  @ApiParam({ name: 'id', description: 'member_id of the Library Member (e.g. 1)' })
  getFines(@Param('id', ParseIntPipe) id: number) {
    return this.membersService.getFines(id);
  }
}
