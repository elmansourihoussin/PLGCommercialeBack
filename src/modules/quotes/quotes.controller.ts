import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { ListQuotesQueryDto } from './dto/list-quotes.query';
import type { Response } from 'express';

@ApiTags('Quotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get('next-number')
  getNextNumber(@TenantId() tenantId: string) {
    return this.quotesService.nextQuoteNumber(tenantId);
  }

  @Get()
  list(@TenantId() tenantId: string, @Query() query: ListQuotesQueryDto) {
    return this.quotesService.list(tenantId, query);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(tenantId, dto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.quotesService.findOne(tenantId, id);
  }

  @Get(':id/pdf')
  async getPdf(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.quotesService.generatePdf(
      tenantId,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=\"${filename}\"`);
    res.send(buffer);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.quotesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.quotesService.remove(tenantId, id);
  }

  @Post(':id/convert-to-invoice')
  convertToInvoice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.quotesService.convertToInvoice(tenantId, id);
  }
}
