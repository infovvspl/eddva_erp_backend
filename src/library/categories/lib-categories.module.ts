import { Module } from '@nestjs/common';
import { LibCategoriesController } from './lib-categories.controller';
import { LibCategoriesService } from './lib-categories.service';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule],
  controllers: [LibCategoriesController],
  providers: [LibCategoriesService],
  exports: [LibCategoriesService],
})
export class LibCategoriesModule {}
