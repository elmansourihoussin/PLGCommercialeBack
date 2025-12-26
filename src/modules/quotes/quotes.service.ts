import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { formatSequenceNumber } from '../../common/utils/numbering';

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async nextQuoteNumber(tenantId: string) {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const count = await this.prisma.quote.count({
      where: {
        tenantId,
        createdAt: { gte: start, lt: end },
      },
    });

    return formatSequenceNumber('DEV', year, count + 1);
  }
}
