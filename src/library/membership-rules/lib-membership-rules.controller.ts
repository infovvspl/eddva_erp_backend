import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { LibMembershipRulesService } from './lib-membership-rules.service';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CreateMembershipRuleDto } from './dto/create-membership-rule.dto';
import { UpdateMembershipRuleDto } from './dto/update-membership-rule.dto';
import { LibUser } from '../auth/lib-user.decorator';
import type { LibPlatformUser } from '../auth/lib-auth.service';

@ApiTags('Library / Membership Rules')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/membership-rules')
export class LibMembershipRulesController {
  constructor(private readonly rulesService: LibMembershipRulesService) {}

  @Post()
  @RequirePermission({ resource: 'membership_rules', action: 'create' })
  @ApiOperation({ summary: 'Create membership rule for a member_type (admin)' })
  create(@LibUser() user: LibPlatformUser, @Body() dto: CreateMembershipRuleDto) {
    return this.rulesService.create(user.institute_id, dto);
  }

  @Get()
  @RequirePermission({ resource: 'membership_rules', action: 'read' })
  @ApiOperation({ summary: 'List all membership rules' })
  findAll(@LibUser() user: LibPlatformUser) {
    return this.rulesService.findAll(user.institute_id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'membership_rules', action: 'update' })
  @ApiOperation({ summary: 'Update membership rule (admin)' })
  @ApiParam({ name: 'id', description: 'rule_id of the Membership Rule to update (e.g. 1)' })
  update(
    @LibUser() user: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMembershipRuleDto,
  ) {
    return this.rulesService.update(user.institute_id, id, dto);
  }
}
