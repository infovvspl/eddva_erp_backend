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
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { SessionsService } from './sessions.service';
import {
  CreateAdmissionSessionDto,
  QueryAdmissionSessionDto,
  UpdateAdmissionSessionDto,
} from './dto/session.dto';

@ApiTags('Admission / Academic Sessions')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/sessions')
export class SessionsController {
  constructor(private readonly svc: SessionsService) {}

  @Post()
  @RequirePermission({ resource: 'sessions', action: 'create' })
  @ApiOperation({ summary: 'Create an academic session' })
  create(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: CreateAdmissionSessionDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'sessions', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter/paginate academic sessions' })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryAdmissionSessionDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'sessions', action: 'read' })
  @ApiOperation({ summary: 'Get an academic session' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'sessions', action: 'update' })
  @ApiOperation({
    summary: 'Update an academic session (status changes included)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdmissionSessionDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'sessions', action: 'delete' })
  @ApiOperation({ summary: 'Soft-delete a session that has no applications' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }
}
