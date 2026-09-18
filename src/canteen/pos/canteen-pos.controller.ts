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
import { RequireCanteenPermission } from '../decorators/require-canteen-permission.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';

@ApiTags('Canteen POS Management')
@ApiBearerAuth()
@UseGuards(CanteenJwtGuard, CanteenInstituteAdminViewOnlyGuard, CanteenPermissionsGuard)
@Controller('api/canteen')
export class CanteenPosController {
  constructor(private readonly posService: CanteenPosService) {}

  // --- Terminals ---
  @ApiOperation({ summary: 'Register POS terminal' })
  @RequireCanteenPermission('canteen.terminal.create')
  @Post('pos-terminals')
  async createTerminal(@Body() dto: CreatePosTerminalDto, @CanteenUser() user: any) {
    return this.posService.createTerminal(dto, user?.id);
  }

  @ApiOperation({ summary: 'List POS terminals' })
  @RequireCanteenPermission('canteen.terminal.view')
  @Get('pos-terminals')
  async getTerminals() {
    return this.posService.getTerminals();
  }

  @ApiOperation({ summary: 'Get POS terminal by ID' })
  @RequireCanteenPermission('canteen.terminal.view')
  @Get('pos-terminals/:id')
  async getTerminalById(@Param('id') id: string) {
    return this.posService.getTerminalById(id);
  }

  @ApiOperation({ summary: 'Update POS terminal' })
  @RequireCanteenPermission('canteen.terminal.update')
  @Patch('pos-terminals/:id')
  async updateTerminal(
    @Param('id') id: string,
    @Body() dto: UpdatePosTerminalDto,
    @CanteenUser() user: any,
  ) {
    return this.posService.updateTerminal(id, dto, user?.id);
  }

  @ApiOperation({ summary: 'Delete POS terminal' })
  @RequireCanteenPermission('canteen.terminal.delete')
  @Delete('pos-terminals/:id')
  async deleteTerminal(@Param('id') id: string, @CanteenUser() user: any) {
    return this.posService.deleteTerminal(id, user?.id);
  }

  // --- Shifts ---
  @ApiOperation({ summary: 'Open POS terminal shift' })
  @RequireCanteenPermission('canteen.shift.open')
  @Post('shifts/open')
  async openShift(@Body() dto: OpenPosShiftDto, @CanteenUser() user: any) {
    return this.posService.openShift(dto, user?.id);
  }

  @ApiOperation({ summary: 'List POS shifts' })
  @RequireCanteenPermission('canteen.shift.view')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'terminalId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'status', required: false })
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
  @RequireCanteenPermission('canteen.shift.view')
  @Get('shifts/:id')
  async getShiftById(@Param('id') id: string) {
    return this.posService.getShiftById(id);
  }

  @ApiOperation({ summary: 'Close POS shift and reconcile cash' })
  @RequireCanteenPermission('canteen.shift.close')
  @Post('shifts/:id/close')
  async closeShift(
    @Param('id') id: string,
    @Body() dto: ClosePosShiftDto,
    @CanteenUser() user: any,
  ) {
    return this.posService.closeShift(id, dto, user?.id);
  }
}
