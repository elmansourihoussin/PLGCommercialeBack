import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const [clients, quotes, invoices, cheques] = await Promise.all([
      this.prisma.client.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.quote.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.invoice.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.cheque.count({ where: { tenantId, deletedAt: null } }),
    ]);

    return {
      clients,
      quotes,
      invoices,
      cheques,
    };
  }
}
