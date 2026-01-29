import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { formatSequenceNumber } from '../../common/utils/numbering';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { withBaseUrl } from '../../common/utils/url';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.query';
import { CreateInvoicePaymentDto } from './dto/create-invoice-payment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanLimitsService } from '../../common/limits/plan-limits.service';
import puppeteer from 'puppeteer';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly limits: PlanLimitsService,
  ) {}

  async list(tenantId: string, query: ListInvoicesQueryDto) {
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

    const [total, items, totals, paidTotals] = await Promise.all([
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
      this.prisma.invoice.aggregate({
        where: { tenantId, deletedAt: null },
        _sum: { total: true },
      }),
      this.prisma.invoicePayment.aggregate({
        where: { tenantId },
        _sum: { amount: true },
      }),
    ]);

    const paymentSums = await this.getPaymentSums(tenantId, items.map((item) => item.id));

    return {
      data: items.map((invoice) =>
        this.withPaymentTotals(invoice, paymentSums[invoice.id] ?? 0),
      ),
      meta: {
        ...buildPaginationMeta(page, limit, total),
        totalInvoicesAmount: Number(totals._sum.total ?? 0),
        totalPaidAmount: Number(paidTotals._sum.amount ?? 0),
      },
    };
  }

  async create(tenantId: string, dto: CreateInvoiceDto) {
    await this.limits.assertCanCreate(tenantId, 'invoices');
    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }
    await this.ensureArticles(tenantId, dto.items);

    const number = dto.number ?? (await this.nextInvoiceNumber(tenantId));
    const { items, totals } = this.buildInvoiceLines(
      dto.items,
      dto.defaultTaxRate,
    );

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
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: true,
        client: { select: { id: true, name: true } },
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const paymentTotal = invoice.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    return this.withPaymentTotals(invoice, paymentTotal);
  }

  async generatePdf(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: true,
        client: true,
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });

    const paidAmount = invoice.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    const tenantForPdf = tenant
      ? { ...tenant, logoUrl: withBaseUrl(tenant.logoUrl) }
      : tenant;
    const html = buildInvoiceHtml({
      invoice,
      tenant: tenantForPdf,
      paidAmount,
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });
    await browser.close();

    return {
      buffer,
      filename: `facture-${invoice.number}.pdf`,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateInvoiceDto) {
    await this.findOne(tenantId, id);

    if (dto.clientId) {
      await this.ensureClient(tenantId, dto.clientId);
    }
    if (dto.items) {
      await this.ensureArticles(tenantId, dto.items);
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
      defaultTaxRate: dto.defaultTaxRate,
    };

    if (dto.clientId !== undefined) {
      data.client = dto.clientId
        ? { connect: { id: dto.clientId } }
        : { disconnect: true };
    }

    if (shouldUpdateItems) {
      const { totals } = this.buildInvoiceLines(
        dto.items ?? [],
        dto.defaultTaxRate,
      );
      data.subtotal = totals.subtotal;
      data.taxAmount = totals.taxAmount;
      data.total = totals.total;
    }

    return this.prisma.$transaction(async (tx) => {
      if (shouldUpdateItems) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        if (dto.items?.length) {
          await tx.invoiceLine.createMany({
            data: this.buildInvoiceLines(dto.items, dto.defaultTaxRate).items.map(
              (item) => ({
                invoiceId: id,
                ...item,
              }),
            ),
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

  async listPayments(tenantId: string, invoiceId: string) {
    await this.findOne(tenantId, invoiceId);

    return this.prisma.invoicePayment.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addPayment(
    tenantId: string,
    invoiceId: string,
    dto: CreateInvoicePaymentDto,
  ) {
    const invoice = await this.findOne(tenantId, invoiceId);
    const paidAmount = Number(invoice.paidAmount ?? 0);
    const nextPaid = paidAmount + dto.amount;

    if (nextPaid > Number(invoice.total)) {
      throw new BadRequestException('Payment exceeds invoice total');
    }

    const payment = await this.prisma.invoicePayment.create({
      data: {
        tenantId,
        invoiceId,
        amount: dto.amount,
        method: dto.method,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        reference: dto.reference,
        note: dto.note,
      },
    });

    const fullyPaid = nextPaid === Number(invoice.total);
    await this.notifications.createSystem(tenantId, {
      type: fullyPaid
        ? NotificationType.PAYMENT_RECEIVED
        : NotificationType.PAYMENT_PARTIAL,
      title: fullyPaid ? 'Paiement recu' : 'Paiement partiel recu',
      message: fullyPaid
        ? `Paiement total recu pour la facture ${invoice.number}.`
        : `Paiement partiel recu pour la facture ${invoice.number}.`,
      entityType: 'invoice',
      entityId: invoice.id,
      eventKey: payment.id,
      data: { invoiceId: invoice.id, paymentId: payment.id, amount: payment.amount },
    });

    return payment;
  }

  async removePayment(tenantId: string, invoiceId: string, paymentId: string) {
    await this.findOne(tenantId, invoiceId);

    const payment = await this.prisma.invoicePayment.findFirst({
      where: { id: paymentId, tenantId, invoiceId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.prisma.invoicePayment.delete({ where: { id: paymentId } });

    return { success: true };
  }

  private async getPaymentSums(tenantId: string, invoiceIds: string[]) {
    if (!invoiceIds.length) {
      return {};
    }

    const grouped = await this.prisma.invoicePayment.groupBy({
      by: ['invoiceId'],
      where: { tenantId, invoiceId: { in: invoiceIds } },
      _sum: { amount: true },
    });

    return grouped.reduce<Record<string, number>>((acc, row) => {
      acc[row.invoiceId] = Number(row._sum.amount ?? 0);
      return acc;
    }, {});
  }

  private withPaymentTotals<T extends { total: Prisma.Decimal | number }>(
    invoice: T,
    amountPaid: number,
  ) {
    const total = Number(invoice.total);
    return {
      ...invoice,
      paidAmount: amountPaid,
      amountPaid,
      balanceDue: Math.max(0, total - amountPaid),
    };
  }

  private buildInvoiceLines(
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
}

const formatDate = (date?: Date | null) =>
  date
    ? new Intl.DateTimeFormat('fr-FR').format(date)
    : '-';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD',
  }).format(value);

const buildInvoiceHtml = ({
  invoice,
  tenant,
  paidAmount,
}: {
  invoice: any;
  tenant: any;
  paidAmount: number;
}) => {
  const logoImg = tenant?.logoUrl
    ? `<img src="${tenant.logoUrl}" alt="logo" />`
    : '';

  const itemsRows = invoice.items
    .map(
      (item: any) => `
      <tr>
        <td>${item.label}</td>
        <td class="right">${item.quantity}</td>
        <td class="right">${formatMoney(Number(item.unitPrice))}</td>
        <td class="right">${formatMoney(Number(item.lineTotal))}</td>
        <td class="right">${formatMoney(Number(item.taxAmount ?? 0))}</td>
      </tr>
    `,
    )
    .join('');

  const balanceDue = Math.max(0, Number(invoice.total) - paidAmount);

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
    .container { padding: 24px 28px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo img { width: 48px; height: 48px; }
    .title { font-size: 24px; font-weight: 700; }
    .muted { color: #475569; font-size: 12px; }
    .section { margin-top: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
    th { background: #f8fafc; text-align: left; }
    .right { text-align: right; }
    .totals { width: 100%; margin-top: 12px; }
    .totals td { padding: 4px 6px; }
    .highlight { font-weight: 700; }
    .footer { margin-top: 28px; font-size: 10px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        ${logoImg}
        <div>
          <div class="title">${tenant?.name ?? 'Entreprise'}</div>
          <div class="muted">${tenant?.email ?? ''} ${tenant?.phone ? '• ' + tenant.phone : ''}</div>
        </div>
      </div>
      <div>
        <div class="title">Facture</div>
        <div class="muted">N° ${invoice.number}</div>
      </div>
    </div>

    <div class="section grid">
      <div>
        <div class="muted">Facturé à</div>
        <div class="highlight">${invoice.client?.name ?? '-'}</div>
        <div class="muted">${invoice.client?.email ?? ''}</div>
        <div class="muted">${invoice.client?.phone ?? ''}</div>
        <div class="muted">${invoice.client?.address ?? ''}</div>
      </div>
      <div>
        <div class="muted">Détails</div>
        <div>Date facture: ${formatDate(invoice.invoiceDate)}</div>
        <div>Échéance: ${formatDate(invoice.dueDate)}</div>
        <div>Mode de paiement: ${invoice.paymentMethod ?? '-'}</div>
        <div>Status: ${invoice.status ?? '-'}</div>
      </div>
    </div>

    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Article</th>
            <th class="right">Qté</th>
            <th class="right">Prix</th>
            <th class="right">Total HT</th>
            <th class="right">TVA</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <table class="totals">
        <tr>
          <td class="right">Sous-total</td>
          <td class="right">${formatMoney(Number(invoice.subtotal))}</td>
        </tr>
        <tr>
          <td class="right">TVA</td>
          <td class="right">${formatMoney(Number(invoice.taxAmount))}</td>
        </tr>
        <tr class="highlight">
          <td class="right">Total</td>
          <td class="right">${formatMoney(Number(invoice.total))}</td>
        </tr>
        <tr>
          <td class="right">Montant payé</td>
          <td class="right">${formatMoney(paidAmount)}</td>
        </tr>
        <tr class="highlight">
          <td class="right">Reste à payer</td>
          <td class="right">${formatMoney(balanceDue)}</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <div class="muted">Note</div>
      <div>${invoice.note ?? '-'}</div>
    </div>

    <div class="footer">
      ${tenant?.legalMentions ?? ''}
    </div>
  </div>
</body>
</html>
`;
};
