import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsJobs } from './notifications.jobs';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsJobs],
  exports: [NotificationsService],
})
export class NotificationsModule {}
