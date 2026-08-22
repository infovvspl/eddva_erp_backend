import { Module } from '@nestjs/common';
import { LibCatalogController } from './lib-catalog.controller';
import { LibCatalogService } from './lib-catalog.service';
import { LibCategoriesModule } from '../categories/lib-categories.module';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule, LibCategoriesModule],
  controllers: [LibCatalogController],
  providers: [LibCatalogService],
  exports: [LibCatalogService],
})
export class LibCatalogModule {}
