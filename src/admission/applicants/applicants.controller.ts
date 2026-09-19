import {
  Body,
  Controller,
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
import { ApplicantsService } from './applicants.service';
import {
  CreateApplicantDto,
  QueryApplicantDto,
  UpdateApplicantDto,
} from './dto/applicant.dto';

@ApiTags('Admission / Applicants')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/applicants')
export class ApplicantsController {
  constructor(private readonly svc: ApplicantsService) {}

  @Post()
  @RequirePermission({ resource: 'applicants', action: 'create' })
  @ApiOperation({
    summary:
      'Create an applicant (the person). 409 DUPLICATE_APPLICANT if the same person already exists',
  })
  create(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: CreateApplicantDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'applicants', action: 'read' })
  @ApiOperation({
    summary: 'Search/paginate applicants (use before creating one)',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryApplicantDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'applicants', action: 'read' })
  @ApiOperation({ summary: 'Get an applicant with all of their applications' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'applicants', action: 'update' })
  @ApiOperation({ summary: 'Update an applicant' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicantDto,
  ) {
    return this.svc.update(user, id, dto);
  }
}
