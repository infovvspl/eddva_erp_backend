import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { EmploymentService } from './employment.service';
import { CreateEmploymentDto, UpdateEmploymentDto } from './dto/employment.dto';

@ApiTags('Alumni / Employment History')
@ApiBearerAuth()
@UseGuards(
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
)
@Controller('api/alumni/profiles/:alumniId/employment')
export class EmploymentController {
  constructor(private readonly svc: EmploymentService) {}

  @Get()
  @RequirePermission({ resource: 'employment', action: 'read' })
  @ApiOperation({ summary: 'Career timeline (current first, then newest)' })
  @ApiParam({ name: 'alumniId', example: 1 })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('alumniId', ParseIntPipe) alumniId: number,
  ) {
    return this.svc.findAll(user, alumniId);
  }

  // Declared before ':employmentId' so "current" is not parsed as an id.
  @Get('current')
  @RequirePermission({ resource: 'employment', action: 'read' })
  @ApiOperation({ summary: 'Current position (404 when none)' })
  @ApiParam({ name: 'alumniId', example: 1 })
  current(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('alumniId', ParseIntPipe) alumniId: number,
  ) {
    return this.svc.current(user, alumniId);
  }

  @Post()
  @RequirePermission({ resource: 'employment', action: 'create' })
  @ApiOperation({
    summary:
      'Add a position. Marking it current closes the alumnus’s previous current position',
  })
  @ApiParam({ name: 'alumniId', example: 1 })
  create(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('alumniId', ParseIntPipe) alumniId: number,
    @Body() dto: CreateEmploymentDto,
  ) {
    return this.svc.create(user, alumniId, dto);
  }

  @Patch(':employmentId')
  @RequirePermission({ resource: 'employment', action: 'update' })
  @ApiOperation({ summary: 'Update a position' })
  @ApiParam({ name: 'alumniId', example: 1 })
  @ApiParam({ name: 'employmentId', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('alumniId', ParseIntPipe) alumniId: number,
    @Param('employmentId', ParseIntPipe) employmentId: number,
    @Body() dto: UpdateEmploymentDto,
  ) {
    return this.svc.update(user, alumniId, employmentId, dto);
  }

  @Post(':employmentId/set-current')
  @RequirePermission({ resource: 'employment', action: 'update' })
  @ApiOperation({
    summary: 'Make this position the current one (closes any other current)',
  })
  @ApiParam({ name: 'alumniId', example: 1 })
  @ApiParam({ name: 'employmentId', example: 1 })
  setCurrent(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('alumniId', ParseIntPipe) alumniId: number,
    @Param('employmentId', ParseIntPipe) employmentId: number,
  ) {
    return this.svc.setCurrent(user, alumniId, employmentId);
  }

  @Delete(':employmentId')
  @RequirePermission({ resource: 'employment', action: 'delete' })
  @ApiOperation({
    summary: 'Remove a position from the timeline (soft delete)',
  })
  @ApiParam({ name: 'alumniId', example: 1 })
  @ApiParam({ name: 'employmentId', example: 1 })
  remove(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('alumniId', ParseIntPipe) alumniId: number,
    @Param('employmentId', ParseIntPipe) employmentId: number,
  ) {
    return this.svc.remove(user, alumniId, employmentId);
  }
}
