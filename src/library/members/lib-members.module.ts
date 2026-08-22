import { Module } from '@nestjs/common';
import { LibMembersController } from './lib-members.controller';
import { LibMembersService } from './lib-members.service';
import { LibMembershipRulesModule } from '../membership-rules/lib-membership-rules.module';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule, LibMembershipRulesModule],
  controllers: [LibMembersController],
  providers: [LibMembersService],
  exports: [LibMembersService],
})
export class LibMembersModule {}
