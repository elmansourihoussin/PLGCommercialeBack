import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@ApiTags('Platform Auth')
@UseGuards(ApiKeyGuard)
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly authService: PlatformAuthService) {}

  @Post('login')
  login(@Body() dto: PlatformLoginDto) {
    return this.authService.login(dto);
  }

  @Post('users')
  createPlatformUser(@Body() dto: CreatePlatformUserDto) {
    return this.authService.createAdmin(dto.email, dto.password, dto.role);
  }
}
