import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { ListChequesQueryDto } from './dto/list-cheques.query';

@Injectable()
export class ChequesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListChequesQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);

    const where = {
      tenantId,
      deletedAt: null,
    };

    const [total, items] = await Promise.all([
      this.prisma.cheque.count({ where }),
      this.prisma.cheque.findMany({
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
}
