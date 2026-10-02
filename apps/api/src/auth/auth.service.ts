import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string, deviceId?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) throw new UnauthorizedException('Неверный логин или пароль');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Неверный логин или пароль');

    const sessionDeviceId = deviceId || randomUUID();
    const tokens = await this.issueTokens(user.id, user.email, user.role);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);

    // Auto-terminate previous session when logging in from another device
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash, sessionDeviceId },
    });

    return {
      ...tokens,
      deviceId: sessionDeviceId,
      user: this.publicUser(user),
    };
  }

  async refresh(userId: string, refreshToken: string, deviceId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.refreshTokenHash || !user.isActive) {
      throw new UnauthorizedException('Сессия недействительна');
    }
    if (deviceId && user.sessionDeviceId && user.sessionDeviceId !== deviceId) {
      throw new UnauthorizedException('Сессия завершена: вход с другого устройства');
    }
    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Сессия недействительна');

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });
    return { ...tokens, user: this.publicUser(user) };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null, sessionDeviceId: null },
    });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { orgUnit: true, visibilityProfile: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async updateProfile(userId: string, data: { firstName?: string; lastName?: string; middleName?: string; phone?: string; mangoExtension?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        phone: data.phone,
        ...(data.mangoExtension !== undefined
          ? { mangoExtension: data.mangoExtension?.trim() || null }
          : {}),
      },
      include: { orgUnit: true, visibilityProfile: true },
    });
    return this.publicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Неверный текущий пароль');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshTokenHash: null, sessionDeviceId: null },
    });
    return { ok: true };
  }

  private async issueTokens(sub: string, email: string, role: string) {
    const payload = { sub, email, role };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') || '7d',
    });
    return { accessToken, refreshToken };
  }

  private publicUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      phone: user.phone,
      mangoExtension: user.mangoExtension ?? null,
      role: user.role,
      orgUnitId: user.orgUnitId,
      orgUnit: user.orgUnit ?? undefined,
      visibilityProfile: user.visibilityProfile ?? undefined,
    };
  }
}
