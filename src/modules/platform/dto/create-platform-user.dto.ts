import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { PlatformRole } from '@prisma/client';

export class CreatePlatformUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(PlatformRole)
  role: PlatformRole;
}
