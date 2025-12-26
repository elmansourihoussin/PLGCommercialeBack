import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { ChequesService } from './cheques.service';
import { ListChequesQueryDto } from './dto/list-cheques.query';

@ApiTags('Cheques')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('cheques')
export class ChequesController {
  constructor(private readonly chequesService: ChequesService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query() query: ListChequesQueryDto) {
    return this.chequesService.list(tenantId, query);
  }
}
