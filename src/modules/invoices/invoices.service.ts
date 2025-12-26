import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { formatSequenceNumber } from '../../common/utils/numbering';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { calculateTotals } from '../../common/utils/totals';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.query';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListInvoicesQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);
    const search = query.search?.trim();

    const where = {
      tenantId,
      deletedAt: null,
      status: query.status,
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
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
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

  async create(tenantId: string, dto: CreateInvoiceDto) {
    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }

    const number = dto.number ?? (await this.nextInvoiceNumber(tenantId));
    const totals = calculateTotals(dto.items, dto.taxRate ?? 0);

    const items = dto.items.map((item) => ({
      label: item.label,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.quantity * item.unitPrice,
    }));

    return this.prisma.invoice.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        title: dto.title,
        note: dto.note,
        paymentMethod: dto.paymentMethod,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        number,
        status: dto.status,
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
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: true,
        client: { select: { id: true, name: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async update(tenantId: string, id: string, dto: UpdateInvoiceDto) {
    await this.findOne(tenantId, id);

    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }

    const shouldUpdateItems = dto.items !== undefined;

    const data: Prisma.InvoiceUpdateInput = {
      number: dto.number,
      status: dto.status,
      title: dto.title,
      note: dto.note,
      paymentMethod: dto.paymentMethod,
      invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    };

    if (dto.clientId !== undefined) {
      data.client = dto.clientId
        ? { connect: { id: dto.clientId } }
        : { disconnect: true };
    }

    if (shouldUpdateItems) {
      const totals = calculateTotals(dto.items ?? [], dto.taxRate ?? 0);
      data.subtotal = totals.subtotal;
      data.taxAmount = totals.taxAmount;
      data.total = totals.total;
    }

    return this.prisma.$transaction(async (tx) => {
      if (shouldUpdateItems) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        if (dto.items?.length) {
          await tx.invoiceLine.createMany({
            data: dto.items.map((item) => ({
              invoiceId: id,
              label: item.label,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.quantity * item.unitPrice,
            })),
          });
        }
      }

      return tx.invoice.update({
        where: { id },
        data,
        include: {
          items: true,
          client: { select: { id: true, name: true } },
        },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.invoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async nextInvoiceNumber(tenantId: string) {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const count = await this.prisma.invoice.count({
      where: {
        tenantId,
        createdAt: { gte: start, lt: end },
      },
    });

    return formatSequenceNumber('FAC', year, count + 1);
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
