import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @Type(() => Boolean)
  isRead?: boolean;
}
