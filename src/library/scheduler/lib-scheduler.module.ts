import { Module } from '@nestjs/common';
import { LibSchedulerService } from './lib-scheduler.service';
import { LibFinesModule } from '../fines/lib-fines.module';
import { LibReservationsModule } from '../reservations/lib-reservations.module';

@Module({
  imports: [LibFinesModule, LibReservationsModule],
  providers: [LibSchedulerService],
})
export class LibSchedulerModule {}
