import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.query';
import { CreateInvoicePaymentDto } from './dto/create-invoice-payment.dto';
import type { Response } from 'express';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('next-number')
  getNextNumber(@TenantId() tenantId: string) {
    return this.invoicesService.nextInvoiceNumber(tenantId);
  }

  @Get()
  list(@TenantId() tenantId: string, @Query() query: ListInvoicesQueryDto) {
    return this.invoicesService.list(tenantId, query);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(tenantId, dto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }

  @Get(':id/pdf')
  async getPdf(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.invoicesService.generatePdf(
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
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.remove(tenantId, id);
  }

  @Get(':id/payments')
  listPayments(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoicesService.listPayments(tenantId, id);
  }

  @Post(':id/payments')
  addPayment(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateInvoicePaymentDto,
  ) {
    return this.invoicesService.addPayment(tenantId, id, dto);
  }

  @Delete(':id/payments/:paymentId')
  removePayment(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.invoicesService.removePayment(tenantId, id, paymentId);
  }
}
