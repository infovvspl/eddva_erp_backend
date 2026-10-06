import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { LibFinesService } from './lib-fines.service';
import { PayFineDto } from './dto/pay-fine.dto';
import { WaiveFineDto } from './dto/waive-fine.dto';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { LibUser } from '../auth/lib-user.decorator';
import type { LibPlatformUser } from '../auth/lib-auth.service';

@ApiTags('Library / Fines')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/fines')
export class LibFinesController {
  constructor(private readonly finesService: LibFinesService) {}

  @Get(':id')
  @RequirePermission({ resource: 'fines', action: 'read' })
  @ApiOperation({ summary: 'Get fine detail (librarian)' })
  @ApiParam({ name: 'id', description: 'fine_id of the Fine Record (e.g. 1)' })
  findOne(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.finesService.findOne(user.institute_id, id);
  }

  @Post(':id/pay')
  @RequirePermission({ resource: 'fines', action: 'collect' })
  @ApiOperation({ summary: 'Record offline payment (librarian)' })
  @ApiParam({ name: 'id', description: 'fine_id of the Fine Record to pay (e.g. 1)' })
  pay(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: PayFineDto) {
    return this.finesService.pay(user.institute_id, id, dto);
  }

  @Post(':id/waive')
  @RequirePermission({ resource: 'fines', action: 'waive' })
  @ApiOperation({ summary: 'Waive a fine (requires fines waive permission)' })
  @ApiParam({ name: 'id', description: 'fine_id of the Fine Record to waive (e.g. 1)' })
  waive(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: WaiveFineDto) {
    return this.finesService.waive(user.institute_id, id, dto);
  }
}
