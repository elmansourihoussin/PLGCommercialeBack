import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformLoginDto } from './dto/platform-login.dto';
import * as bcrypt from 'bcryptjs';
import type { StringValue } from 'ms';

@Injectable()
export class PlatformAuthService {
  private readonly jwtSecret: string;
  private readonly expiresIn: StringValue | number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtSecret = configService.getOrThrow<string>('PLATFORM_JWT_SECRET');
    this.expiresIn = configService.get('PLATFORM_JWT_EXPIRES_IN', '1d') as StringValue;
  }

  async login(dto: PlatformLoginDto) {
    const user = await this.prisma.platformUser.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        role: user.role,
        email: user.email,
        aud: 'platform',
      },
      {
        secret: this.jwtSecret,
        expiresIn: this.expiresIn,
      },
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
    };
  }

  async createAdmin(email: string, password: string, role: string) {
    const existing = await this.prisma.platformUser.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.platformUser.create({
      data: {
        email,
        passwordHash,
        role: role as any,
      },
      select: { id: true, email: true, role: true, isActive: true },
    });
  }
}
