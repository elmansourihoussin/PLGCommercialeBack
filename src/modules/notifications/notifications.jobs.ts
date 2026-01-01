import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationType } from '@prisma/client';

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

@Injectable()
export class NotificationsJobs {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDaily() {
    await this.invoiceDueSoon(7);
    await this.invoiceDueSoon(1);
    await this.invoiceOverdue();
    await this.chequesDueToday();
    await this.expireQuotes();
  }

  private async invoiceDueSoon(days: number) {
    const target = addDays(startOfDay(new Date()), days);
    const from = startOfDay(target);
    const to = endOfDay(target);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        dueDate: { gte: from, lte: to },
        NOT: { status: 'PAID' },
      },
      select: { id: true, tenantId: true, number: true, dueDate: true },
    });

    await Promise.all(
      invoices.map((invoice) =>
        this.notifications.createSystem(invoice.tenantId, {
          type: NotificationType.INVOICE_DUE_SOON,
          title: `Facture ${invoice.number} a\u0300 e\u0301che\u0301ance`,
          message: `La facture ${invoice.number} arrive a\u0300 e\u0301che\u0301ance dans ${days} jour(s).`,
          entityType: 'invoice',
          entityId: invoice.id,
          eventKey: `due_${days}`,
          data: { invoiceId: invoice.id, days },
        }),
      ),
    );
  }

  private async invoiceOverdue() {
    const today = startOfDay(new Date());

    const invoices = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        dueDate: { lt: today },
        NOT: { status: 'PAID' },
      },
      select: { id: true, tenantId: true, number: true, dueDate: true },
    });

    await Promise.all(
      invoices.map((invoice) =>
        this.notifications.createSystem(invoice.tenantId, {
          type: NotificationType.INVOICE_OVERDUE,
          title: `Facture ${invoice.number} en retard`,
          message: `La facture ${invoice.number} est e\u0301chue.`,
          entityType: 'invoice',
          entityId: invoice.id,
          eventKey: 'overdue',
          data: { invoiceId: invoice.id },
        }),
      ),
    );
  }

  private async chequesDueToday() {
    const today = startOfDay(new Date());
    const to = endOfDay(today);

    const cheques = await this.prisma.cheque.findMany({
      where: {
        deletedAt: null,
        dueDate: { gte: today, lte: to },
        NOT: { status: { in: ['CASHED', 'REJECTED'] } },
      },
      select: { id: true, tenantId: true, amount: true, dueDate: true },
    });

    await Promise.all(
      cheques.map((cheque) =>
        this.notifications.createSystem(cheque.tenantId, {
          type: NotificationType.CHEQUE_DUE,
          title: 'Che\u0300que a\u0300 e\u0301che\u0301ance',
          message: 'Un che\u0300que arrive a\u0300 e\u0301che\u0301ance aujourd\'hui.',
          entityType: 'cheque',
          entityId: cheque.id,
          eventKey: 'due',
          data: { chequeId: cheque.id },
        }),
      ),
    );
  }

  private async expireQuotes() {
    const today = startOfDay(new Date());

    const quotes = await this.prisma.quote.findMany({
      where: {
        deletedAt: null,
        dueDate: { lt: today },
        NOT: { status: { in: ['ACCEPTED', 'REJECTED', 'EXPIRED'] } },
      },
      select: { id: true, tenantId: true, number: true },
    });

    await Promise.all(
      quotes.map(async (quote) => {
        await this.prisma.quote.update({
          where: { id: quote.id },
          data: { status: 'EXPIRED' },
        });
        await this.notifications.createSystem(quote.tenantId, {
          type: NotificationType.QUOTE_EXPIRED,
          title: `Devis ${quote.number} expire\u0301`,
          message: `Le devis ${quote.number} est expire\u0301.`,
          entityType: 'quote',
          entityId: quote.id,
          eventKey: 'expired',
          data: { quoteId: quote.id },
        });
      }),
    );
  }
}
