import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformTenantsService } from './platform-tenants.service';
import { ListTenantsQueryDto } from './dto/list-tenants.query';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@ApiTags('Platform Tenants')
@UseGuards(ApiKeyGuard)
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(private readonly tenantsService: PlatformTenantsService) {}

  @Get()
  list(@Query() query: ListTenantsQueryDto) {
    return this.tenantsService.list(query);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get('stats')
  stats() {
    return this.tenantsService.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenantsService.updateStatus(id, dto);
  }

  @Patch(':id/subscription')
  updateSubscription(
    @Param('id') id: string,
    @Body() dto: UpdateTenantSubscriptionDto,
  ) {
    return this.tenantsService.updateSubscription(id, dto);
  }

  @Get(':id/billing-history')
  billingHistory(@Param('id') id: string) {
    return this.tenantsService.billingHistory(id);
  }
}
