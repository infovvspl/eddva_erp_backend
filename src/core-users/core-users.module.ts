import { Module } from '@nestjs/common';
import { CoreUsersController } from './core-users.controller';
import { CoreUsersService } from './core-users.service';

@Module({
  controllers: [CoreUsersController],
  providers: [CoreUsersService],
})
export class CoreUsersModule {}
