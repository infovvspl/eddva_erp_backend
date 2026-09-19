import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
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
import { MeritListsService } from './merit-lists.service';
import {
  CreateMeritListDto,
  QueryMeritListDto,
  ReplaceMeritEntriesDto,
  UpdateMeritListDto,
} from './dto/merit-list.dto';

@ApiTags('Admission / Merit Lists')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/merit-lists')
export class MeritListsController {
  constructor(private readonly svc: MeritListsService) {}

  @Post()
  @RequirePermission({ resource: 'merit_lists', action: 'create' })
  @ApiOperation({
    summary: 'Create a draft merit list (optionally with ranked entries)',
  })
  create(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: CreateMeritListDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'merit_lists', action: 'read' })
  @ApiOperation({
    summary: 'List merit lists (filter by session, program, published/draft)',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryMeritListDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'merit_lists', action: 'read' })
  @ApiOperation({ summary: 'Get a merit list with ranked entries' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'merit_lists', action: 'update' })
  @ApiOperation({ summary: 'Edit name/criteria of a draft merit list' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMeritListDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Put(':id/entries')
  @RequirePermission({ resource: 'merit_lists', action: 'update' })
  @ApiOperation({ summary: 'Replace all entries of a draft merit list' })
  @ApiParam({ name: 'id', example: 1 })
  replaceEntries(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceMeritEntriesDto,
  ) {
    return this.svc.replaceEntries(user, id, dto);
  }

  @Post(':id/publish')
  @RequirePermission({ resource: 'merit_lists', action: 'publish' })
  @ApiOperation({
    summary:
      'Publish a draft merit list (irreversible): selected → shortlisted, waitlisted → waitlisted applications',
  })
  @ApiParam({ name: 'id', example: 1 })
  publish(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.publish(user, id);
  }
}
