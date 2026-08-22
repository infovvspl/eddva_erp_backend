import { Module } from '@nestjs/common';
import { LibCopiesController } from './lib-copies.controller';
import { LibCopiesService } from './lib-copies.service';
import { BarcodeService } from './barcode.service';
import { LibCatalogModule } from '../catalog/lib-catalog.module';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule, LibCatalogModule],
  controllers: [LibCopiesController],
  providers: [LibCopiesService, BarcodeService],
  exports: [LibCopiesService, BarcodeService],
})
export class LibCopiesModule {}
