import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ListArticlesQueryDto } from './dto/list-articles.query';

@ApiTags('Articles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query() query: ListArticlesQueryDto) {
    return this.articlesService.list(tenantId, query);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateArticleDto) {
    return this.articlesService.create(tenantId, dto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.articlesService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articlesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.articlesService.remove(tenantId, id);
  }
}
