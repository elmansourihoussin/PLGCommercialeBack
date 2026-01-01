import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionStatus } from '@prisma/client';
import { ListBillingHistoryQueryDto } from './dto/list-billing-history.query';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BillingService {
  private readonly changeMessage: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.changeMessage = configService.get(
      'BILLING_CHANGE_MESSAGE',
      'Merci de nous contacter pour changer le plan.',
    );
  }

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
    const current = await this.prisma.billingSubscription.findUnique({
      where: { tenantId },
    });

    return {
      message: this.changeMessage,
      currentPlan: current?.plan ?? 'FREE',
      currentStatus: current?.status ?? SubscriptionStatus.ACTIVE,
      requestedPlan: dto.plan,
      requestedStatus: dto.status,
      note: dto.note,
    };
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
