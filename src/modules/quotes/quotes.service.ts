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
import puppeteer from 'puppeteer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QuotesService {
  private readonly acceptedUpdateMessage: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly limits: PlanLimitsService,
    configService: ConfigService,
  ) {
    this.acceptedUpdateMessage = configService.get(
      'QUOTE_ACCEPTED_UPDATE_MESSAGE',
      'Impossible de modifier un devis deja accepte.',
    );
  }

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
    const normalizedStatus = (current.status ?? '').trim().toUpperCase();
    if (normalizedStatus === 'ACCEPTED') {
      throw new BadRequestException(this.acceptedUpdateMessage);
    }

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

  async convertToInvoice(tenantId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const number = await this.nextInvoiceNumber(tenantId);

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        clientId: quote.clientId,
        title: quote.title,
        note: quote.note,
        paymentMethod: quote.paymentMethod,
        invoiceDate: new Date(),
        dueDate: quote.dueDate,
        number,
        status: 'DRAFT',
        defaultTaxRate: quote.defaultTaxRate,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        total: quote.total,
        items: {
          create: quote.items.map((item) => ({
            label: item.label,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            articleId: item.articleId,
          })),
        },
      },
      include: { items: true, client: { select: { id: true, name: true } } },
    });

    await this.notifications.createSystem(tenantId, {
      type: NotificationType.QUOTE_CONVERTED,
      title: `Devis ${quote.number} converti`,
      message: `Le devis ${quote.number} a ete converti en facture ${invoice.number}.`,
      entityType: 'quote',
      entityId: quote.id,
      eventKey: `converted_${invoice.id}`,
      data: { quoteId: quote.id, invoiceId: invoice.id },
    });

    return invoice;
  }

  private async nextInvoiceNumber(tenantId: string) {
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

  async generatePdf(tenantId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: true,
        client: true,
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });

    const html = buildQuoteHtml({ quote, tenant });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
      filename: `devis-${quote.number}.pdf`,
    };
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

const formatDate = (date?: Date | null) =>
  date
    ? new Intl.DateTimeFormat('fr-FR').format(date)
    : '-';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD',
  }).format(value);

const buildQuoteHtml = ({
  quote,
  tenant,
}: {
  quote: any;
  tenant: any;
}) => {
  const logoSvg =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0f172a"/><text x="50%" y="54%" text-anchor="middle" font-size="26" fill="#fff" font-family="Arial, sans-serif">PLG</text></svg>',
    );

  const itemsRows = quote.items
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
        <img src="${tenant?.logoUrl ?? logoSvg}" alt="logo" />
        <div>
          <div class="title">${tenant?.name ?? 'Entreprise'}</div>
          <div class="muted">${tenant?.email ?? ''} ${tenant?.phone ? '• ' + tenant.phone : ''}</div>
          <div class="muted">ICE: ${tenant?.ice ?? '-'}</div>
        </div>
      </div>
      <div>
        <div class="title">Devis</div>
        <div class="muted">N° ${quote.number}</div>
      </div>
    </div>

    <div class="section grid">
      <div>
        <div class="muted">Établi pour</div>
        <div class="highlight">${quote.client?.name ?? '-'}</div>
        <div class="muted">${quote.client?.email ?? ''}</div>
        <div class="muted">${quote.client?.phone ?? ''}</div>
        <div class="muted">${quote.client?.address ?? ''}</div>
      </div>
      <div>
        <div class="muted">Détails</div>
        <div>Date devis: ${formatDate(quote.quoteDate)}</div>
        <div>Validité: ${formatDate(quote.dueDate)}</div>
        <div>Mode de paiement: ${quote.paymentMethod ?? '-'}</div>
        <div>Status: ${quote.status ?? '-'}</div>
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
          <td class="right">${formatMoney(Number(quote.subtotal))}</td>
        </tr>
        <tr>
          <td class="right">TVA</td>
          <td class="right">${formatMoney(Number(quote.taxAmount))}</td>
        </tr>
        <tr class="highlight">
          <td class="right">Total</td>
          <td class="right">${formatMoney(Number(quote.total))}</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <div class="muted">Note</div>
      <div>${quote.note ?? '-'}</div>
    </div>

    <div class="footer">
      ${tenant?.legalMentions ?? ''}
    </div>
  </div>
</body>
</html>
`;
};
