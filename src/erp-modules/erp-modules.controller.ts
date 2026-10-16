import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ErpModulesService } from './erp-modules.service';

@Controller('erp-modules')
@UseGuards(JwtAuthGuard)
export class ErpModulesController {
  constructor(private readonly service: ErpModulesService) {}

  /**
   * `null` means "not restricted" — the frontend should show every module,
   * same as today. A non-null array is the allow-list of nav paths.
   */
  @Get('enabled')
  async getEnabled(@GetUser('instituteId') instituteId: string | null) {
    const paths = await this.service.getEnabledModulePaths(instituteId);
    return { enabledPaths: paths };
  }
}
