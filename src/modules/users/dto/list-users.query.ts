import { IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '../../../common/constants/roles';

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
