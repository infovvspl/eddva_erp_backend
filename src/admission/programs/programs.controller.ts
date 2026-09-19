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
import { ProgramsService } from './programs.service';
import {
  CreateAdmissionProgramDto,
  QueryAdmissionProgramDto,
  UpdateAdmissionProgramDto,
} from './dto/program.dto';

@ApiTags('Admission / Programs')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/programs')
export class ProgramsController {
  constructor(private readonly svc: ProgramsService) {}

  @Post()
  @RequirePermission({ resource: 'programs', action: 'create' })
  @ApiOperation({
    summary: 'Create a program (class/course being admitted into)',
  })
  create(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: CreateAdmissionProgramDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'programs', action: 'read' })
  @ApiOperation({ summary: 'List/search/paginate programs' })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryAdmissionProgramDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'programs', action: 'read' })
  @ApiOperation({ summary: 'Get a program' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'programs', action: 'update' })
  @ApiOperation({
    summary:
      'Update a program (seats cannot drop below seats already held by offers/admissions)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdmissionProgramDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'programs', action: 'delete' })
  @ApiOperation({
    summary: 'Soft-delete a program with no applications/enquiries',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }
}
