import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class RevenueByMonthQueryDto {
  @IsOptional()
  @Type(() => Number)
  year?: number;
}
