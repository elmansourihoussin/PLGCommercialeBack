import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformJwtGuard } from './guards/platform-jwt.guard';
import { PlatformRolesGuard } from './guards/platform-roles.guard';
import { PlatformRoles } from './guards/platform-roles.decorator';
import { PlatformRole } from '@prisma/client';
import { PlatformTenantsService } from './platform-tenants.service';
import { ListTenantsQueryDto } from './dto/list-tenants.query';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';

@ApiTags('Platform Tenants')
@ApiBearerAuth()
@UseGuards(PlatformJwtGuard, PlatformRolesGuard)
@PlatformRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
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
