import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlanLimitsService } from '../../common/limits/plan-limits.service';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination/pagination';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ListArticlesQueryDto } from './dto/list-articles.query';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: PlanLimitsService,
  ) {}

  async list(tenantId: string, query: ListArticlesQueryDto) {
    const { page, limit, skip, take } = normalizePagination(query);
    const search = query.search?.trim();

    const where = {
      tenantId,
      deletedAt: null,
      OR: search
        ? [
            { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { sku: { contains: search, mode: Prisma.QueryMode.insensitive } },
          ]
        : undefined,
    };

    const [total, items] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
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

  async create(tenantId: string, dto: CreateArticleDto) {
    await this.limits.assertCanCreate(tenantId, 'articles');
    return this.prisma.article.create({
      data: {
        tenantId,
        name: dto.name,
        sku: dto.sku,
        description: dto.description,
        unitPrice: dto.unitPrice,
        taxRate: dto.taxRate,
        stockQty: dto.stockQty ?? 0,
        unit: dto.unit,
        isService: dto.isService ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const article = await this.prisma.article.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return article;
  }

  async update(tenantId: string, id: string, dto: UpdateArticleDto) {
    await this.findOne(tenantId, id);

    return this.prisma.article.update({
      where: { id },
      data: {
        name: dto.name,
        sku: dto.sku,
        description: dto.description,
        unitPrice: dto.unitPrice,
        taxRate: dto.taxRate,
        stockQty: dto.stockQty,
        unit: dto.unit,
        isService: dto.isService,
        isActive: dto.isActive,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.article.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { success: true };
  }
}
