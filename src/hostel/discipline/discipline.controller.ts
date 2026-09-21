import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { DisciplineService } from './discipline.service';
import {
  CreateDisciplineRecordDto,
  LinkGatePassDto,
  QueryDisciplineDto,
} from './dto/discipline.dto';

@ApiTags('Hostel / Discipline')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel')
export class DisciplineController {
  constructor(private readonly svc: DisciplineService) {}

  @Post('residents/:id/discipline-records')
  @RequirePermission({ resource: 'discipline', action: 'create' })
  @ApiOperation({
    summary:
      'Record a discipline incident for a resident (optionally linked to one of their gate passes)',
  })
  @ApiParam({ name: 'id', example: 1 })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDisciplineRecordDto,
  ) {
    return this.svc.create(user, id, dto);
  }

  @Get('residents/:id/discipline-records')
  @RequirePermission({ resource: 'discipline', action: 'read' })
  @ApiOperation({ summary: 'Discipline history of one resident' })
  @ApiParam({ name: 'id', example: 1 })
  residentHistory(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryDisciplineDto,
  ) {
    return this.svc.residentHistory(user.institute_id, id, query);
  }

  @Get('discipline-records')
  @RequirePermission({ resource: 'discipline', action: 'read' })
  @ApiOperation({
    summary: 'List discipline records (category, action, resident, date range)',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryDisciplineDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get('discipline-records/:id')
  @RequirePermission({ resource: 'discipline', action: 'read' })
  @ApiOperation({ summary: 'Get a discipline record' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Post('discipline-records/:id/link-gate-pass')
  @RequirePermission({ resource: 'discipline', action: 'link' })
  @ApiOperation({
    summary: "Link a record to one of the same resident's gate passes",
  })
  @ApiParam({ name: 'id', example: 1 })
  link(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkGatePassDto,
  ) {
    return this.svc.linkGatePass(user, id, dto.gate_pass_id);
  }
}
