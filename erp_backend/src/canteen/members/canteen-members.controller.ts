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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CanteenPermissionsGuard } from '../guards/canteen-permissions.guard';
import { RequireCanteenPermission } from '../decorators/require-canteen-permission.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { CanteenMemberType } from '@prisma/client';

@ApiTags('Canteen Member Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CanteenPermissionsGuard)
@Controller('api/canteen/members')
export class CanteenMembersController {
  constructor(private readonly membersService: CanteenMembersService) {}

  @ApiOperation({ summary: 'Register new canteen member' })
  @RequireCanteenPermission('canteen.member.create')
  @Post()
  async createMember(@Body() dto: CreateCanteenMemberDto, @GetUser() user: any) {
    return this.membersService.createMember(dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'List canteen members (with search, memberType, barcode, pagination)' })
  @RequireCanteenPermission('canteen.member.view')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'memberType', enum: CanteenMemberType, required: false })
  @ApiQuery({ name: 'externalRefId', required: false })
  @ApiQuery({ name: 'sort', required: false })
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
  @RequireCanteenPermission('canteen.member.barcode_lookup')
  @Get('barcode/:barcode')
  async getMemberByBarcode(@Param('barcode') barcode: string) {
    return this.membersService.getMemberByBarcode(barcode);
  }

  @ApiOperation({ summary: 'Get canteen member by ID' })
  @RequireCanteenPermission('canteen.member.view')
  @Get(':id')
  async getMemberById(@Param('id') id: string) {
    return this.membersService.getMemberById(id);
  }

  @ApiOperation({ summary: 'Update canteen member details' })
  @RequireCanteenPermission('canteen.member.update')
  @Patch(':id')
  async updateMember(
    @Param('id') id: string,
    @Body() dto: UpdateCanteenMemberDto,
    @GetUser() user: any,
  ) {
    return this.membersService.updateMember(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Delete canteen member profile' })
  @RequireCanteenPermission('canteen.member.delete')
  @Delete(':id')
  async deleteMember(@Param('id') id: string, @GetUser() user: any) {
    return this.membersService.deleteMember(id, user?.id || user?.userId);
  }
}
