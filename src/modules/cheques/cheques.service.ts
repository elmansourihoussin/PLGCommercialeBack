import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { ListChequesQueryDto } from './dto/list-cheques.query';
import { CreateChequeDto } from './dto/create-cheque.dto';
import { UpdateChequeDto } from './dto/update-cheque.dto';

@Injectable()
export class ChequesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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

    const cheque = await this.prisma.cheque.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        amount: dto.amount,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: { client: { select: { id: true, name: true } } },
    });

    await this.notifyChequeStatus(tenantId, cheque.id, null, cheque.status);

    return cheque;
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
    const current = await this.findOne(tenantId, id);

    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }

    const updated = await this.prisma.cheque.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        amount: dto.amount,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: { client: { select: { id: true, name: true } } },
    });

    await this.notifyChequeStatus(tenantId, updated.id, current.status, updated.status);

    return updated;
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

  private async notifyChequeStatus(
    tenantId: string,
    chequeId: string,
    previousStatus?: string | null,
    nextStatus?: string | null,
  ) {
    if (!nextStatus || nextStatus === previousStatus) {
      return;
    }

    if (nextStatus === 'CASHED') {
      await this.notifications.createSystem(tenantId, {
        type: NotificationType.CHEQUE_CASHED,
        title: 'Cheque encaisse',
        message: 'Un cheque a ete encaisse.',
        entityType: 'cheque',
        entityId: chequeId,
        eventKey: 'cashed',
        data: { chequeId },
      });
    }

    if (nextStatus === 'REJECTED') {
      await this.notifications.createSystem(tenantId, {
        type: NotificationType.CHEQUE_REJECTED,
        title: 'Cheque rejete',
        message: 'Un cheque a ete rejete.',
        entityType: 'cheque',
        entityId: chequeId,
        eventKey: 'rejected',
        data: { chequeId },
      });
    }
  }
}
