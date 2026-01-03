import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export type LimitResource =
  | 'clients'
  | 'invoices'
  | 'quotes'
  | 'cheques'
  | 'articles';

@Injectable()
export class PlanLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async assertCanCreate(tenantId: string, resource: LimitResource) {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { tenantId },
    });

    const plan = subscription?.plan ?? 'FREE';
    if (plan !== 'FREE') {
      return;
    }

    const limit = this.getLimit(resource);
    const count = await this.countResource(tenantId, resource);

    if (count >= limit) {
      throw new BadRequestException(
        `Free plan limit reached for ${resource} (${limit}).`,
      );
    }
  }

  private getLimit(resource: LimitResource) {
    const defaults: Record<LimitResource, number> = {
      clients: 10,
      invoices: 5,
      quotes: 5,
      cheques: 5,
      articles: 5,
    };

    const keys: Record<LimitResource, string> = {
      clients: 'FREE_CLIENTS_LIMIT',
      invoices: 'FREE_INVOICES_LIMIT',
      quotes: 'FREE_QUOTES_LIMIT',
      cheques: 'FREE_CHEQUES_LIMIT',
      articles: 'FREE_ARTICLES_LIMIT',
    };

    const value = this.configService.get<string>(keys[resource]);
    const parsed = value ? Number(value) : defaults[resource];
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaults[resource];
  }

  private async countResource(tenantId: string, resource: LimitResource) {
    switch (resource) {
      case 'clients':
        return this.prisma.client.count({
          where: { tenantId, deletedAt: null },
        });
      case 'invoices':
        return this.prisma.invoice.count({
          where: { tenantId, deletedAt: null },
        });
      case 'quotes':
        return this.prisma.quote.count({
          where: { tenantId, deletedAt: null },
        });
      case 'cheques':
        return this.prisma.cheque.count({
          where: { tenantId, deletedAt: null },
        });
      case 'articles':
        return this.prisma.article.count({
          where: { tenantId, deletedAt: null },
        });
      default:
        return 0;
    }
  }
}
