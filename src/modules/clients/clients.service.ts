import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsQueryDto } from './dto/list-clients.query';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListClientsQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);
    const search = query.search?.trim();

    const where = {
      tenantId,
      deletedAt: null,
      OR: search
        ? [
            { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { phone: { contains: search, mode: Prisma.QueryMode.insensitive } },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          _count: { select: { invoices: true } },
        },
      }),
    ]);

    return {
      data: items.map((client) => ({
        ...client,
        invoicesCount: client._count.invoices,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async create(tenantId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: {
        tenantId,
        ...dto,
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        quotes: {
          where: { deletedAt: null },
          select: { id: true, number: true, total: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          where: { deletedAt: null },
          select: { id: true, number: true, total: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { invoices: true } },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return {
      ...client,
      invoicesCount: client._count.invoices,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateClientDto) {
    await this.findOne(tenantId, id);

    return this.prisma.client.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }
}
