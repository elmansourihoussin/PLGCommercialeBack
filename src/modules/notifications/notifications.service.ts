import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { ListNotificationsQueryDto } from './dto/list-notifications.query';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string, query: ListNotificationsQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);

    const where = {
      tenantId,
      isRead: query.isRead,
      OR: [{ userId }, { userId: null }],
    };

    const [total, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return {
      data: items,
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async create(tenantId: string, dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        tenantId,
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        data: dto.data as Prisma.InputJsonValue | undefined,
        entityType: dto.entityType,
        entityId: dto.entityId,
        eventKey: dto.eventKey,
      },
    });
  }

  async createSystem(
    tenantId: string,
    payload: Omit<CreateNotificationDto, 'userId'> & {
      userId?: string;
    },
  ) {
    try {
      return await this.prisma.notification.create({
        data: {
          tenantId,
          userId: payload.userId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          data: payload.data as Prisma.InputJsonValue | undefined,
          entityType: payload.entityType,
          entityId: payload.entityId,
          eventKey: payload.eventKey,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return null;
        }
      }
      throw error;
    }
  }

  async markRead(tenantId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        tenantId,
        OR: [{ userId }, { userId: null }],
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(tenantId: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        tenantId,
        isRead: false,
        OR: [{ userId }, { userId: null }],
      },
      data: { isRead: true },
    });

    return { success: true };
  }
}
