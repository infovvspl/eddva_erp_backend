import { Module } from '@nestjs/common';
import { LibBookVendorsController } from './lib-book-vendors.controller';
import { LibBookVendorsService } from './lib-book-vendors.service';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule],
  controllers: [LibBookVendorsController],
  providers: [LibBookVendorsService],
})
export class LibBookVendorsModule {}
