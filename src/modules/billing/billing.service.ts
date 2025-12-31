import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionStatus } from '@prisma/client';
import { ListBillingHistoryQueryDto } from './dto/list-billing-history.query';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubscription(tenantId: string) {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { tenantId },
    });

    if (subscription) {
      return subscription;
    }

    return {
      tenantId,
      plan: 'FREE',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
    };
  }

  async updateSubscription(tenantId: string, dto: UpdateSubscriptionDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.billingSubscription.findUnique({
        where: { tenantId },
      });

      const subscription = await tx.billingSubscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          plan: dto.plan ?? 'PRO',
          status: dto.status ?? SubscriptionStatus.ACTIVE,
          currentPeriodEnd: null,
        },
        update: {
          plan: dto.plan,
          status: dto.status,
        },
      });

      await tx.billingSubscriptionHistory.create({
        data: {
          tenantId,
          plan: subscription.plan,
          status: subscription.status,
          action: existing ? 'UPDATED' : 'CREATED',
          note: dto.note,
        },
      });

      return subscription;
    });
  }

  async listHistory(tenantId: string, query: ListBillingHistoryQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);

    const [total, items] = await Promise.all([
      this.prisma.billingSubscriptionHistory.count({ where: { tenantId } }),
      this.prisma.billingSubscriptionHistory.findMany({
        where: { tenantId },
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
}
