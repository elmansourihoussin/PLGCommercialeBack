import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { DashboardService } from './dashboard.service';
import { RevenueByMonthQueryDto } from './dto/revenue-by-month.query';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  overview(@TenantId() tenantId: string) {
    return this.dashboardService.overview(tenantId);
  }

  @Get('revenue-by-month')
  revenueByMonth(
    @TenantId() tenantId: string,
    @Query() query: RevenueByMonthQueryDto,
  ) {
    return this.dashboardService.revenueByMonth(tenantId, query);
  }
}
