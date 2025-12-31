import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { ListChequesQueryDto } from './dto/list-cheques.query';
import { CreateChequeDto } from './dto/create-cheque.dto';
import { UpdateChequeDto } from './dto/update-cheque.dto';

@Injectable()
export class ChequesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListChequesQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);

    const where = {
      tenantId,
      deletedAt: null,
      status: query.status,
      clientId: query.clientId,
    };

    const [total, items] = await Promise.all([
      this.prisma.cheque.count({ where }),
      this.prisma.cheque.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { client: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      data: items,
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async create(tenantId: string, dto: CreateChequeDto) {
    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }

    return this.prisma.cheque.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        amount: dto.amount,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async findOne(tenantId: string, id: string) {
    const cheque = await this.prisma.cheque.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { client: { select: { id: true, name: true } } },
    });

    if (!cheque) {
      throw new NotFoundException('Cheque not found');
    }

    return cheque;
  }

  async update(tenantId: string, id: string, dto: UpdateChequeDto) {
    await this.findOne(tenantId, id);

    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }

    return this.prisma.cheque.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        amount: dto.amount,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.cheque.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private async ensureClient(tenantId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new BadRequestException('Client not found for tenant');
    }
  }
}
