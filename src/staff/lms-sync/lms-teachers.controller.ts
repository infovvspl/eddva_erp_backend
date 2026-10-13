import { Controller, Get, InternalServerErrorException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StaffLmsSyncService } from './staff-lms-sync.service';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / LMS Teachers (read-only)')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/lms-teachers')
export class LmsTeachersController {
  constructor(private readonly lmsSync: StaffLmsSyncService) {}

  @Get()
  @RequirePermission({ resource: 'staff_members', action: 'read' })
  @ApiOperation({
    summary:
      "Every teacher that already exists in the LMS for this institute, flagged with whether a matching ERP staff record exists. Read-only — doesn't create or import anything.",
  })
  async list(@StaffUser() actor: StaffPlatformUser) {
    try {
      return await this.lmsSync.listLmsTeachers(actor.institute_id);
    } catch (err) {
      throw new InternalServerErrorException((err as Error).message);
    }
  }
}
