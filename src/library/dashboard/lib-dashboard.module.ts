import { Module } from '@nestjs/common';
import { LibAuthModule } from '../auth/lib-auth.module';
import { LibDashboardController } from './lib-dashboard.controller';
import { LibDashboardService } from './lib-dashboard.service';

@Module({
  imports: [LibAuthModule],
  controllers: [LibDashboardController],
  providers: [LibDashboardService],
})
export class LibDashboardModule {}
