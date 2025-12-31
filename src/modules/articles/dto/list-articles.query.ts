import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ListArticlesQueryDto {
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
