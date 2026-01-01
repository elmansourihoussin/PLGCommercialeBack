import { Module } from '@nestjs/common';
import { ChequesController } from './cheques.controller';
import { ChequesService } from './cheques.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ChequesController],
  providers: [ChequesService],
})
export class ChequesModule {}
