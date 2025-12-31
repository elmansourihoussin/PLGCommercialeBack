import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const [clients, quotes, invoices, invoiceStatusGroups, quoteStatusGroups] =
      await Promise.all([
        this.prisma.client.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.quote.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.invoice.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.invoice.groupBy({
          by: ['status'],
          where: { tenantId, deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.quote.groupBy({
          by: ['status'],
          where: { tenantId, deletedAt: null },
          _count: { _all: true },
        }),
      ]);

    const invoicesByStatus = invoiceStatusGroups.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.status ?? 'UNKNOWN'] = row._count._all;
        return acc;
      },
      {},
    );

    return {
      clients,
      quotes,
      invoices,
      invoicesByStatus,
      quotesByStatus: quoteStatusGroups.reduce<Record<string, number>>(
        (acc, row) => {
          acc[row.status ?? 'UNKNOWN'] = row._count._all;
          return acc;
        },
        {},
      ),
    };
  }
}
