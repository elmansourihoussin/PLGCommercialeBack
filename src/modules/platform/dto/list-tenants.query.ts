import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ListTenantsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
