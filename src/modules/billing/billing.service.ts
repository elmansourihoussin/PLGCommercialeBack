import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionStatus } from '@prisma/client';

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
    return this.prisma.billingSubscription.upsert({
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
  }
}
