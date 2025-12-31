import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { BillingService } from './billing.service';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { ListBillingHistoryQueryDto } from './dto/list-billing-history.query';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('subscription')
  getSubscription(@TenantId() tenantId: string) {
    return this.billingService.getSubscription(tenantId);
  }

  @Patch('subscription')
  updateSubscription(
    @TenantId() tenantId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.billingService.updateSubscription(tenantId, dto);
  }

  @Get('history')
  listHistory(
    @TenantId() tenantId: string,
    @Query() query: ListBillingHistoryQueryDto,
  ) {
    return this.billingService.listHistory(tenantId, query);
  }
}
