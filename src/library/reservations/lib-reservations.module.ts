import { Module } from '@nestjs/common';
import { LibReservationsController } from './lib-reservations.controller';
import { LibReservationsService } from './lib-reservations.service';
import { LibAuthModule } from '../auth/lib-auth.module';

@Module({
  imports: [LibAuthModule],
  controllers: [LibReservationsController],
  providers: [LibReservationsService],
  exports: [LibReservationsService],
})
export class LibReservationsModule {}
