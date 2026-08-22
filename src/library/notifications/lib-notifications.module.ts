import { Global, Module } from '@nestjs/common';
import { LibNotificationService } from './lib-notification.service';
import { LibNotificationsController } from './lib-notifications.controller';
import { LibAuthModule } from '../auth/lib-auth.module';

@Global()
@Module({
  imports: [LibAuthModule],
  controllers: [LibNotificationsController],
  providers: [LibNotificationService],
  exports: [LibNotificationService],
})
export class LibNotificationsModule {}
