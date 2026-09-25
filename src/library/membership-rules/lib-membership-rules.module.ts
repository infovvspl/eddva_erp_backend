import { Module } from '@nestjs/common';
import { LibMembershipRulesController } from './lib-membership-rules.controller';
import { LibMembershipRulesService } from './lib-membership-rules.service';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule],
  controllers: [LibMembershipRulesController],
  providers: [LibMembershipRulesService],
  exports: [LibMembershipRulesService],
})
export class LibMembershipRulesModule {}
