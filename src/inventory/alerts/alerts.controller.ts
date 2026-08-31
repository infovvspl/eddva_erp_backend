import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AlertsService } from './alerts.service';

@ApiTags('Inventory / Alerts')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('low-stock')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({ summary: 'Items at or below their configured reorder level, with a per-location breakdown' })
  lowStock() {
    return this.alertsService.lowStock();
  }

  @Get('overdue-returns')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({ summary: 'Issues whose expected return date has passed without a complete return' })
  overdueReturns() {
    return this.alertsService.overdueReturns();
  }
}
