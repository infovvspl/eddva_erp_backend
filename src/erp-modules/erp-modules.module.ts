import { Module } from '@nestjs/common';
import { ErpModulesController } from './erp-modules.controller';
import { ErpModulesService } from './erp-modules.service';

@Module({
  controllers: [ErpModulesController],
  providers: [ErpModulesService],
})
export class ErpModulesModule {}
