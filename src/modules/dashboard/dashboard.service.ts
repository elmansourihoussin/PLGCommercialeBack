import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RevenueByMonthQueryDto } from './dto/revenue-by-month.query';

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

  async revenueByMonth(tenantId: string, query: RevenueByMonthQueryDto) {
    const year = query.year ?? new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const rows = await this.prisma.$queryRaw<
      { month: number; total: Prisma.Decimal }[]
    >(Prisma.sql`
      SELECT
        EXTRACT(MONTH FROM COALESCE("paidAt", "createdAt"))::int AS month,
        SUM(amount) AS total
      FROM "InvoicePayment"
      WHERE "tenantId" = ${tenantId}
        AND COALESCE("paidAt", "createdAt") >= ${start}
        AND COALESCE("paidAt", "createdAt") < ${end}
      GROUP BY 1
      ORDER BY 1
    `);

    const totalsByMonth = new Map<number, number>();
    for (const row of rows) {
      totalsByMonth.set(row.month, Number(row.total ?? 0));
    }

    return {
      year,
      data: Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return { month, total: totalsByMonth.get(month) ?? 0 };
      }),
    };
  }
}
