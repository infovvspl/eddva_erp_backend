import { Module } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { MatchService } from './match.service';
import { PurchaseController } from './purchase.controller';
import { AccountsCoreModule } from '../accounts/accounts-core.module';

@Module({
  imports: [AccountsCoreModule],
  controllers: [PurchaseController],
  providers: [PurchaseService, MatchService],
  exports: [PurchaseService, MatchService],
})
export class PurchaseModule {}
