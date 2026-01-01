import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformJwtStrategy } from './strategies/platform-jwt.strategy';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformTenantsService } from './platform-tenants.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('PLATFORM_JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('PLATFORM_JWT_EXPIRES_IN', '1d'),
        },
      }),
    }),
  ],
  controllers: [PlatformAuthController, PlatformTenantsController],
  providers: [PlatformAuthService, PlatformJwtStrategy, PlatformTenantsService],
})
export class PlatformModule {}
