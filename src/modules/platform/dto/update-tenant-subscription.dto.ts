import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class UpdateTenantSubscriptionDto {
  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
