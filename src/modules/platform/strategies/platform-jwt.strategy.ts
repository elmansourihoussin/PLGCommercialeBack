import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';

interface PlatformJwtPayload {
  sub: string;
  role: string;
  email: string;
  aud?: string;
}

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('PLATFORM_JWT_SECRET'),
    });
  }

  async validate(payload: PlatformJwtPayload) {
    if (payload.aud !== 'platform') {
      throw new UnauthorizedException('Invalid token audience');
    }

    const user = await this.prisma.platformUser.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    return { id: user.id, role: user.role, email: user.email };
  }
}
