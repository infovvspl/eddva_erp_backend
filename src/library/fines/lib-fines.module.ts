import { Module } from '@nestjs/common';
import { LibFinesController } from './lib-fines.controller';
import { LibFinesService } from './lib-fines.service';
import { LibAuthModule } from '../auth/lib-auth.module';
import { AccountsCoreModule } from '../../accounts/accounts-core.module';

@Module({
  imports: [LibAuthModule, AccountsCoreModule],
  controllers: [LibFinesController],
  providers: [LibFinesService],
  exports: [LibFinesService],
})
export class LibFinesModule {}
