import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ListChequesQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
