import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from '../auth/front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from '../auth/front-office-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { FrontOfficeUser } from '../auth/front-office-user.decorator';
import type { FrontOfficePlatformUser } from '../auth/front-office-auth.service';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('Front Office / Departments')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @RequirePermission({ resource: 'departments', action: 'create' })
  @ApiOperation({ summary: 'Create a Front Office department' })
  create(@Body() dto: CreateDepartmentDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.departmentsService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'departments', action: 'read' })
  @ApiOperation({ summary: 'List/search Front Office departments' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@Query('search') search?: string) {
    return this.departmentsService.findAll(search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'departments', action: 'read' })
  @ApiOperation({ summary: 'Get a Front Office department' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'departments', action: 'update' })
  @ApiOperation({ summary: 'Update a Front Office department' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepartmentDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.departmentsService.update(id, dto, user.eddva_user_id);
  }
}
