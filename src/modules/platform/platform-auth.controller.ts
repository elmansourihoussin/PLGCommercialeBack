import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { PlatformJwtGuard } from './guards/platform-jwt.guard';
import { PlatformRolesGuard } from './guards/platform-roles.guard';
import { PlatformRoles } from './guards/platform-roles.decorator';
import { PlatformRole } from '@prisma/client';

@ApiTags('Platform Auth')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly authService: PlatformAuthService) {}

  @Post('login')
  login(@Body() dto: PlatformLoginDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformJwtGuard, PlatformRolesGuard)
  @PlatformRoles(PlatformRole.ROOT)
  @Post('users')
  createPlatformUser(@Body() dto: CreatePlatformUserDto) {
    return this.authService.createAdmin(dto.email, dto.password, dto.role);
  }
}
