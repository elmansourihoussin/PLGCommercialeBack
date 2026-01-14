import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '../../common/constants/roles';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { randomBytes } from 'crypto';
import type { StringValue } from 'ms';

interface TokenPayload {
  sub: string;
  tenantId: string;
  role: Role;
  email: string;
}

interface RefreshPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTokenTtl: StringValue | number;
  private readonly refreshTokenTtl: StringValue | number;
  private readonly refreshMaxDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtSecret = configService.getOrThrow<string>('JWT_SECRET');
    this.refreshSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTokenTtl = configService.get(
      'JWT_EXPIRES_IN',
      '15m',
    ) as StringValue;
    this.refreshTokenTtl = configService.get(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    ) as StringValue;
    this.refreshMaxDays = Number(configService.get('JWT_REFRESH_MAX_DAYS', 7));
  }

  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    const userEmail = dto.email ?? dto.companyEmail;
    const existing = await this.prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          ice: dto.ice,
          logoUrl: dto.logoUrl,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          email: dto.companyEmail,
          legalMentions: dto.legalMentions,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: userEmail,
          passwordHash,
          fullName: dto.fullName,
          role: Role.OWNER,
        },
        select: {
          id: true,
          tenantId: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.billingSubscription.create({
        data: {
          tenantId: tenant.id,
          plan: 'FREE',
          status: 'ACTIVE',
          currentPeriodEnd: null,
        },
      });

      return { tenant, user };
    });

    const maxExpiresAt = this.getMaxRefreshExpiry();
    const session = await this.createSession(
      result.user.id,
      maxExpiresAt,
      ip,
      userAgent,
    );
    const tokens = await this.issueTokens(result.user, session.id, maxExpiresAt);

    return { user: result.user, tenant: result.tenant, ...tokens };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const maxExpiresAt = this.getMaxRefreshExpiry();
    const session = await this.createSession(user.id, maxExpiresAt, ip, userAgent);
    const tokens = await this.issueTokens(user, session.id, maxExpiresAt);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(dto: RefreshDto, ip?: string, userAgent?: string) {
    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(
        dto.refreshToken,
        { secret: this.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh session expired');
    }

    const isValid = await bcrypt.compare(
      dto.refreshToken,
      session.refreshTokenHash,
    );
    if (!isValid) {
      await this.revokeAllSessions(session.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const tokens = await this.issueTokens(
      session.user,
      session.id,
      session.expiresAt,
      ip,
      userAgent,
    );
    return { user: this.sanitizeUser(session.user), ...tokens };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null, refreshTokenMaxExpiresAt: null },
    });
    await this.revokeAllSessions(userId);

    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      return { success: true };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpiresAt: expiresAt,
      },
    });

    // Mock behavior: log the token for now.
    // eslint-disable-next-line no-console
    console.log(`[mock] password reset token for ${user.email}: ${token}`);

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new ForbiddenException('Invalid or expired token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    return { success: true };
  }

  private async issueTokens(
    user: {
      id: string;
      tenantId: string;
      role: Role;
      email: string;
    },
    sessionId: string,
    maxExpiresAt?: Date,
    ip?: string,
    userAgent?: string,
  ) {
    const payload: TokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };

    const refreshExpiresIn =
      maxExpiresAt !== undefined
        ? Math.max(1, Math.floor((maxExpiresAt.getTime() - Date.now()) / 1000))
        : this.refreshTokenTtl;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.accessTokenTtl,
      }),
      this.jwtService.signAsync(
        { sub: user.id, sid: sessionId },
        {
          secret: this.refreshSecret,
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash,
        expiresAt: maxExpiresAt ?? this.getMaxRefreshExpiry(),
        lastUsedAt: new Date(),
        ip,
        userAgent,
      },
    });

    return { accessToken, refreshToken };
  }

  private getMaxRefreshExpiry() {
    const days = Number.isFinite(this.refreshMaxDays) && this.refreshMaxDays > 0
      ? this.refreshMaxDays
      : 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async createSession(
    userId: string,
    expiresAt: Date,
    ip?: string,
    userAgent?: string,
  ) {
    const hash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    return this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: hash,
        expiresAt,
        ip,
        userAgent,
      },
    });
  }

  private async revokeAllSessions(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private sanitizeUser(user: {
    id: string;
    tenantId: string;
    email: string;
    fullName: string;
    role: Role;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
