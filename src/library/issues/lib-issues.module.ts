import { Module } from '@nestjs/common';
import { LibIssuesController } from './lib-issues.controller';
import { IssueService } from './issue.service';
import { ReturnService } from './return.service';
import { LibCopiesModule } from '../copies/lib-copies.module';
import { LibMembersModule } from '../members/lib-members.module';
import { LibMembershipRulesModule } from '../membership-rules/lib-membership-rules.module';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule, LibCopiesModule, LibMembersModule, LibMembershipRulesModule],
  controllers: [LibIssuesController],
  providers: [IssueService, ReturnService],
  exports: [IssueService, ReturnService],
})
export class LibIssuesModule {}
