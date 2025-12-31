import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
