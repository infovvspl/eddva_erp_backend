import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CanteenPosService } from './canteen-pos.service';
import { CreatePosTerminalDto } from './dto/create-pos-terminal.dto';
import { UpdatePosTerminalDto } from './dto/update-pos-terminal.dto';
import { OpenPosShiftDto } from './dto/open-pos-shift.dto';
import { ClosePosShiftDto } from './dto/close-pos-shift.dto';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenInstituteAdminViewOnlyGuard } from '../auth/canteen-institute-admin-view-only.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';

@ApiTags('Canteen POS Management')
@ApiBearerAuth()
@UseGuards(
  CanteenJwtGuard,
  CanteenInstituteAdminViewOnlyGuard,
  CanteenPermissionsGuard,
)
@Controller('api/canteen')
export class CanteenPosController {
  constructor(private readonly posService: CanteenPosService) {}

  // --- Terminals ---
  @ApiOperation({ summary: 'Register POS terminal' })
  @RequirePermission({ resource: 'pos_terminals', action: 'create' })
  @Post('pos-terminals')
  async createTerminal(@Body() dto: CreatePosTerminalDto, @CanteenUser() user: CanteenPlatformUser) {
    return this.posService.createTerminal(dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'List POS terminals' })
  @RequirePermission({ resource: 'pos_terminals', action: 'read' })
  @Get('pos-terminals')
  async getTerminals() {
    return this.posService.getTerminals();
  }

  @ApiOperation({ summary: 'Get POS terminal by ID' })
  @RequirePermission({ resource: 'pos_terminals', action: 'read' })
  @Get('pos-terminals/:id')
  async getTerminalById(@Param('id') id: string) {
    return this.posService.getTerminalById(id);
  }

  @ApiOperation({ summary: 'Update POS terminal' })
  @RequirePermission({ resource: 'pos_terminals', action: 'update' })
  @Patch('pos-terminals/:id')
  async updateTerminal(
    @Param('id') id: string,
    @Body() dto: UpdatePosTerminalDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.posService.updateTerminal(id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Delete POS terminal' })
  @RequirePermission({ resource: 'pos_terminals', action: 'delete' })
  @Delete('pos-terminals/:id')
  async deleteTerminal(@Param('id') id: string, @CanteenUser() user: CanteenPlatformUser) {
    return this.posService.deleteTerminal(id, user.eddva_user_id);
  }

  // --- Shifts ---
  @ApiOperation({ summary: 'Open POS terminal shift' })
  @RequirePermission({ resource: 'pos_shifts', action: 'open' })
  @Post('shifts/open')
  async openShift(@Body() dto: OpenPosShiftDto, @CanteenUser() user: CanteenPlatformUser) {
    return this.posService.openShift(dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'List POS shifts' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'terminalId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @RequirePermission({ resource: 'pos_shifts', action: 'read' })
  @Get('shifts')
  async getShifts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('terminalId') terminalId?: string,
    @Query('staffId') staffId?: string,
    @Query('status') status?: string,
  ) {
    return this.posService.getShifts({
      page,
      limit,
      terminalId,
      staffId,
      status,
    });
  }

  @ApiOperation({ summary: 'Get POS shift by ID' })
  @RequirePermission({ resource: 'pos_shifts', action: 'read' })
  @Get('shifts/:id')
  async getShiftById(@Param('id') id: string) {
    return this.posService.getShiftById(id);
  }

  @ApiOperation({ summary: 'Close POS shift and reconcile cash' })
  @RequirePermission({ resource: 'pos_shifts', action: 'close' })
  @Post('shifts/:id/close')
  async closeShift(
    @Param('id') id: string,
    @Body() dto: ClosePosShiftDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.posService.closeShift(id, dto, user.eddva_user_id);
  }
}
