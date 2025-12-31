import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { ChequesService } from './cheques.service';
import { ListChequesQueryDto } from './dto/list-cheques.query';
import { CreateChequeDto } from './dto/create-cheque.dto';
import { UpdateChequeDto } from './dto/update-cheque.dto';

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

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateChequeDto) {
    return this.chequesService.create(tenantId, dto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.chequesService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateChequeDto,
  ) {
    return this.chequesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.chequesService.remove(tenantId, id);
  }
}
