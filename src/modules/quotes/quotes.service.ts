import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { formatSequenceNumber } from '../../common/utils/numbering';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { ListQuotesQueryDto } from './dto/list-quotes.query';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanLimitsService } from '../../common/limits/plan-limits.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly limits: PlanLimitsService,
  ) {}

  async list(tenantId: string, query: ListQuotesQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);
    const search = query.search?.trim();

    const where = {
      tenantId,
      deletedAt: null,
      status: query.status,
      clientId: query.clientId,
      OR: search
        ? [
            { number: { contains: search, mode: Prisma.QueryMode.insensitive } },
            {
              client: {
                name: { contains: search, mode: Prisma.QueryMode.insensitive },
              },
            },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prisma.quote.count({ where }),
      this.prisma.quote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          client: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      data: items,
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async create(tenantId: string, dto: CreateQuoteDto) {
    await this.limits.assertCanCreate(tenantId, 'quotes');
    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }
    await this.ensureArticles(tenantId, dto.items);

    const number = dto.number ?? (await this.nextQuoteNumber(tenantId));
    const { items, totals } = this.buildQuoteLines(
      dto.items,
      dto.defaultTaxRate,
    );

    return this.prisma.quote.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        title: dto.title,
        note: dto.note,
        paymentMethod: dto.paymentMethod,
        quoteDate: dto.quoteDate ? new Date(dto.quoteDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        number,
        status: dto.status,
        defaultTaxRate: dto.defaultTaxRate,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        items: { create: items },
      },
      include: {
        items: true,
        client: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: true,
        client: { select: { id: true, name: true } },
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return quote;
  }

  async update(tenantId: string, id: string, dto: UpdateQuoteDto) {
    const current = await this.findOne(tenantId, id);

    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }
    if (dto.items) {
      await this.ensureArticles(tenantId, dto.items);
    }

    const shouldUpdateItems = dto.items !== undefined;

    const data: Prisma.QuoteUpdateInput = {
      number: dto.number,
      status: dto.status,
      title: dto.title,
      note: dto.note,
      paymentMethod: dto.paymentMethod,
      quoteDate: dto.quoteDate ? new Date(dto.quoteDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      defaultTaxRate: dto.defaultTaxRate,
    };

    if (dto.clientId !== undefined) {
      data.client = dto.clientId
        ? { connect: { id: dto.clientId } }
        : { disconnect: true };
    }

    if (shouldUpdateItems) {
      const { totals } = this.buildQuoteLines(
        dto.items ?? [],
        dto.defaultTaxRate,
      );
      data.subtotal = totals.subtotal;
      data.taxAmount = totals.taxAmount;
      data.total = totals.total;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (shouldUpdateItems) {
        await tx.quoteLine.deleteMany({ where: { quoteId: id } });
        if (dto.items?.length) {
          await tx.quoteLine.createMany({
            data: this.buildQuoteLines(dto.items, dto.defaultTaxRate).items.map(
              (item) => ({
                quoteId: id,
                ...item,
              }),
            ),
          });
        }
      }

      return tx.quote.update({
        where: { id },
        data,
        include: {
          items: true,
          client: { select: { id: true, name: true } },
        },
      });
    });

    await this.notifyQuoteStatus(tenantId, current.status, updated.status, updated.id, updated.number);

    return updated;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.quote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

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

  private async ensureClient(tenantId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new BadRequestException('Client not found for tenant');
    }
  }

  private buildQuoteLines(
    items: {
      label: string;
      quantity: number;
      unitPrice: number;
      taxRate?: number;
      articleId?: string;
    }[],
    defaultTaxRate?: number,
  ) {
    const lines = items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      const taxRate = item.taxRate ?? defaultTaxRate ?? 0;
      const taxAmount = lineTotal * taxRate;
      return {
        label: item.label,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal,
        taxRate,
        taxAmount,
        articleId: item.articleId,
      };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const taxAmount = lines.reduce(
      (sum, line) => sum + (line.taxAmount ?? 0),
      0,
    );
    const total = subtotal + taxAmount;

    return { items: lines, totals: { subtotal, taxAmount, total } };
  }

  private async ensureArticles(
    tenantId: string,
    items: { articleId?: string }[],
  ) {
    const articleIds = Array.from(
      new Set(items.map((item) => item.articleId).filter(Boolean)),
    ) as string[];

    if (!articleIds.length) {
      return;
    }

    const count = await this.prisma.article.count({
      where: { tenantId, deletedAt: null, id: { in: articleIds } },
    });

    if (count !== articleIds.length) {
      throw new BadRequestException('Invalid article reference');
    }
  }

  private async notifyQuoteStatus(
    tenantId: string,
    previousStatus: string | null,
    nextStatus: string | null,
    quoteId: string,
    quoteNumber: string,
  ) {
    if (!nextStatus || nextStatus === previousStatus) {
      return;
    }

    if (nextStatus === 'ACCEPTED') {
      await this.notifications.createSystem(tenantId, {
        type: NotificationType.QUOTE_ACCEPTED,
        title: `Devis ${quoteNumber} accepte`,
        message: `Le devis ${quoteNumber} a ete accepte.`,
        entityType: 'quote',
        entityId: quoteId,
        eventKey: 'accepted',
        data: { quoteId },
      });
    }

    if (nextStatus === 'REJECTED') {
      await this.notifications.createSystem(tenantId, {
        type: NotificationType.QUOTE_REJECTED,
        title: `Devis ${quoteNumber} refuse`,
        message: `Le devis ${quoteNumber} a ete refuse.`,
        entityType: 'quote',
        entityId: quoteId,
        eventKey: 'rejected',
        data: { quoteId },
      });
    }
  }
}
