import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CanteenMembersService } from './canteen-members.service';
import { CreateCanteenMemberDto } from './dto/create-canteen-member.dto';
import { UpdateCanteenMemberDto } from './dto/update-canteen-member.dto';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenInstituteAdminViewOnlyGuard } from '../auth/canteen-institute-admin-view-only.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';
import { CanteenMemberType } from '@prisma/client';

@ApiTags('Canteen Member Management')
@ApiBearerAuth()
@UseGuards(
  CanteenJwtGuard,
  CanteenInstituteAdminViewOnlyGuard,
  CanteenPermissionsGuard,
)
@Controller('api/canteen/members')
export class CanteenMembersController {
  constructor(private readonly membersService: CanteenMembersService) {}

  @ApiOperation({ summary: 'Register new canteen member' })
  @RequirePermission({ resource: 'members', action: 'create' })
  @Post()
  async createMember(@Body() dto: CreateCanteenMemberDto, @CanteenUser() user: CanteenPlatformUser) {
    return this.membersService.createMember(dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'List canteen members (with search, memberType, barcode, pagination)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'memberType', enum: CanteenMemberType, required: false })
  @ApiQuery({ name: 'externalRefId', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @RequirePermission({ resource: 'members', action: 'read' })
  @Get()
  async getMembers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('memberType') memberType?: CanteenMemberType,
    @Query('externalRefId') externalRefId?: string,
    @Query('sort') sort?: string,
  ) {
    return this.membersService.getMembers({
      page,
      limit,
      search,
      memberType,
      externalRefId,
      sort,
    });
  }

  @ApiOperation({ summary: 'Lookup member profile by barcode' })
  @RequirePermission({ resource: 'members', action: 'barcode_lookup' })
  @Get('barcode/:barcode')
  async getMemberByBarcode(@Param('barcode') barcode: string) {
    return this.membersService.getMemberByBarcode(barcode);
  }

  @ApiOperation({ summary: 'Get canteen member by ID' })
  @RequirePermission({ resource: 'members', action: 'read' })
  @Get(':id')
  async getMemberById(@Param('id') id: string) {
    return this.membersService.getMemberById(id);
  }

  @ApiOperation({ summary: 'Update canteen member details' })
  @RequirePermission({ resource: 'members', action: 'update' })
  @Patch(':id')
  async updateMember(
    @Param('id') id: string,
    @Body() dto: UpdateCanteenMemberDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.membersService.updateMember(id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Delete canteen member profile' })
  @RequirePermission({ resource: 'members', action: 'delete' })
  @Delete(':id')
  async deleteMember(@Param('id') id: string, @CanteenUser() user: CanteenPlatformUser) {
    return this.membersService.deleteMember(id, user.eddva_user_id);
  }
}
