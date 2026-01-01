import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto/list-notifications.query';
import { CreateNotificationDto } from './dto/create-notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.list(tenantId, user.id, query).then((res) => ({
      notifications: res.data,
      meta: res.meta,
    }));
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(tenantId, dto);
  }

  @Patch(':id/read')
  markRead(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markRead(tenantId, user.id, id);
  }

  @Patch('read-all')
  markAllRead(@TenantId() tenantId: string, @CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllRead(tenantId, user.id);
  }
}
