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
import { TestsService } from './tests.service';
import {
  CreateEntranceTestDto,
  QueryEntranceTestDto,
  RecordResultsDto,
  RegisterApplicantsDto,
  UpdateEntranceTestDto,
  UpdateRegistrationDto,
} from './dto/test.dto';

@ApiTags('Admission / Entrance Tests')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/tests')
export class TestsController {
  constructor(private readonly svc: TestsService) {}

  @Post()
  @RequirePermission({ resource: 'tests', action: 'create' })
  @ApiOperation({ summary: 'Create an entrance test' })
  create(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: CreateEntranceTestDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'tests', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter/paginate entrance tests' })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryEntranceTestDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'tests', action: 'read' })
  @ApiOperation({
    summary: 'Get an entrance test with registration/result counts',
  })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'tests', action: 'update' })
  @ApiOperation({ summary: 'Update an entrance test' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntranceTestDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/register')
  @RequirePermission({ resource: 'tests', action: 'register' })
  @ApiOperation({
    summary:
      'Register applications for the test and issue unique hall tickets (all-or-nothing batch). Optional stage — applications are never required to sit a test',
  })
  @ApiParam({ name: 'id', example: 1 })
  register(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterApplicantsDto,
  ) {
    return this.svc.register(user, id, dto);
  }

  @Get(':id/registrations')
  @RequirePermission({ resource: 'tests', action: 'read' })
  @ApiOperation({ summary: 'Registrations (hall tickets) for a test' })
  @ApiParam({ name: 'id', example: 1 })
  listRegistrations(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.listRegistrations(user.institute_id, id);
  }

  @Patch(':id/registrations/:registrationId')
  @RequirePermission({ resource: 'tests', action: 'register' })
  @ApiOperation({ summary: 'Mark an applicant appeared / absent' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiParam({ name: 'registrationId', example: 1 })
  updateRegistration(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('registrationId', ParseIntPipe) registrationId: number,
    @Body() dto: UpdateRegistrationDto,
  ) {
    return this.svc.updateRegistration(user, id, registrationId, dto);
  }

  @Post(':id/results')
  @RequirePermission({ resource: 'tests', action: 'record_results' })
  @ApiOperation({
    summary:
      'Record or correct marks for registered applicants; ranks are recomputed for the whole test',
  })
  @ApiParam({ name: 'id', example: 1 })
  recordResults(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordResultsDto,
  ) {
    return this.svc.recordResults(user, id, dto);
  }

  @Get(':id/results')
  @RequirePermission({ resource: 'tests', action: 'read' })
  @ApiOperation({ summary: 'Results for a test, best rank first' })
  @ApiParam({ name: 'id', example: 1 })
  getResults(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getResults(user.institute_id, id);
  }
}
