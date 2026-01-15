import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { ListTenantsQueryDto } from './dto/list-tenants.query';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class PlatformTenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTenantsQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);
    const search = query.search?.trim();

    const where = {
      deletedAt: null,
      OR: search
        ? [
            { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          subscription: true,
        },
      }),
    ]);

    return {
      data: items,
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({
      data: {
        name: dto.name,
        ice: dto.ice,
        logoUrl: dto.logoUrl,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        email: dto.email,
        legalMentions: dto.legalMentions,
      },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: { subscription: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async updateStatus(id: string, dto: UpdateTenantStatusDto) {
    await this.findOne(id);

    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
  }

  async updateSubscription(id: string, dto: UpdateTenantSubscriptionDto) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.billingSubscription.findUnique({
        where: { tenantId: id },
      });

      const subscription = await tx.billingSubscription.upsert({
        where: { tenantId: id },
        create: {
          tenantId: id,
          plan: dto.plan ?? 'PRO',
          status: dto.status ?? SubscriptionStatus.ACTIVE,
          currentPeriodEnd: null,
        },
        update: {
          plan: dto.plan,
          status: dto.status,
        },
      });

      await tx.billingSubscriptionHistory.create({
        data: {
          tenantId: id,
          plan: subscription.plan,
          status: subscription.status,
          action: existing ? 'UPDATED' : 'CREATED',
          note: dto.note,
        },
      });

      return subscription;
    });
  }

  async billingHistory(id: string) {
    await this.findOne(id);

    return this.prisma.billingSubscriptionHistory.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async stats() {
    const [totalCompanies, activeCompanies, freeCompanies, proCompanies] =
      await Promise.all([
        this.prisma.tenant.count({ where: { deletedAt: null } }),
        this.prisma.tenant.count({
          where: { deletedAt: null, isActive: true },
        }),
        this.prisma.billingSubscription.count({
          where: { plan: 'FREE', tenant: { deletedAt: null } },
        }),
        this.prisma.billingSubscription.count({
          where: { plan: 'PRO', tenant: { deletedAt: null } },
        }),
      ]);

    return {
      totalCompanies,
      activeCompanies,
      freeCompanies,
      proCompanies,
    };
  }
}
