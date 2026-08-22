import { Module } from '@nestjs/common';
import { LibFinesController } from './lib-fines.controller';
import { LibFinesService } from './lib-fines.service';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule],
  controllers: [LibFinesController],
  providers: [LibFinesService],
  exports: [LibFinesService],
})
export class LibFinesModule {}
