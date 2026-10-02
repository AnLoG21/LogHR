import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hhUserAgent, setHhTokenProvider } from './hh-token';

type HhCreds = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  manager?: { id?: string; email?: string; firstName?: string; lastName?: string };
  employer?: { id?: string; name?: string };
  connectedAt?: string;
};

@Injectable()
export class HhAuthService implements OnModuleInit {
  private readonly logger = new Logger(HhAuthService.name);
  private refreshLock: Promise<string | null> | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    setHhTokenProvider(() => this.getAccessToken());
  }

  publicBaseUrl() {
    return (process.env.WEB_URL || process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
  }

  redirectUri() {
    return process.env.HH_REDIRECT_URI || `${this.publicBaseUrl()}/api/integrations/hh/callback`;
  }

  clientConfigured() {
    return !!(process.env.HH_CLIENT_ID && process.env.HH_CLIENT_SECRET);
  }

  private async getAccount() {
    return this.prisma.jobBoardAccount.findFirst({
      where: { board: 'HH', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private credsOf(account: { credentials: unknown } | null): HhCreds {
    if (!account?.credentials || typeof account.credentials !== 'object') return {};
    return account.credentials as HhCreds;
  }

  async status() {
    const account = await this.getAccount();
    const creds = this.credsOf(account);
    const oauth = !!creds.accessToken;
    const env = !!process.env.HH_ACCESS_TOKEN;
    return {
      clientConfigured: this.clientConfigured(),
      connected: oauth || env,
      viaOAuth: oauth,
      viaEnv: env && !oauth,
      expiresAt: creds.expiresAt || null,
      manager: creds.manager || null,
      employer: creds.employer || null,
      connectedAt: creds.connectedAt || null,
      redirectUri: this.redirectUri(),
      userAgent: hhUserAgent(),
      note: !this.clientConfigured()
        ? 'Укажите HH_CLIENT_ID и HH_CLIENT_SECRET в настройках сервера'
        : oauth
          ? 'HeadHunter подключён'
          : env
            ? 'Используется токен из настроек сервера'
            : 'Нажмите «Подключить HeadHunter»',
    };
  }

  async authorizeUrl() {
    if (!this.clientConfigured()) {
      throw new BadRequestException('Не заданы HH_CLIENT_ID / HH_CLIENT_SECRET');
    }
    const state = randomBytes(24).toString('hex');
    await this.prisma.integrationStatus.upsert({
      where: { code: 'HH' },
      update: { meta: { oauthState: state, oauthStateAt: new Date().toISOString() } as Prisma.InputJsonValue, configured: false },
      create: { code: 'HH', name: 'HeadHunter', meta: { oauthState: state } as Prisma.InputJsonValue },
    });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.HH_CLIENT_ID!,
      redirect_uri: this.redirectUri(),
      state,
    });
    return { url: `https://hh.ru/oauth/authorize?${params}`, state, redirectUri: this.redirectUri() };
  }

  async handleCallback(code?: string, state?: string) {
    if (!code) throw new BadRequestException('Нет кода авторизации');
    const row = await this.prisma.integrationStatus.findUnique({ where: { code: 'HH' } });
    const meta = (row?.meta || {}) as any;
    if (!state || !meta.oauthState || state !== meta.oauthState) {
      throw new BadRequestException('Неверный state — начните подключение заново');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.HH_CLIENT_ID!,
      client_secret: process.env.HH_CLIENT_SECRET!,
      code,
      redirect_uri: this.redirectUri(),
    });
    const tokenRes = await fetch('https://api.hh.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'HH-User-Agent': hhUserAgent() },
      body,
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text().catch(() => '');
      this.logger.warn(`HH token exchange failed: ${tokenRes.status} ${err.slice(0, 300)}`);
      throw new BadRequestException(`HH не выдал токен (${tokenRes.status}). Проверьте Client ID/Secret и Redirect URI.`);
    }
    const tokenData: any = await tokenRes.json();
    const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 1209600) * 1000).toISOString();

    const me = await this.fetchMe(tokenData.access_token);
    const manager = me?.is_employer || me?.employer
      ? {
          id: String(me.id || ''),
          email: me.email || undefined,
          firstName: me.first_name || undefined,
          lastName: me.last_name || undefined,
        }
      : undefined;
    const employer = me?.employer
      ? { id: String(me.employer.id || ''), name: me.employer.name || undefined }
      : undefined;

    const credentials: HhCreds = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
      tokenType: tokenData.token_type || 'bearer',
      manager,
      employer,
      connectedAt: new Date().toISOString(),
    };

    const existing = await this.getAccount();
    if (existing) {
      await this.prisma.jobBoardAccount.update({
        where: { id: existing.id },
        data: {
          name: employer?.name ? `HH · ${employer.name}` : 'HeadHunter',
          credentials: credentials as Prisma.InputJsonValue,
          isActive: true,
        },
      });
    } else {
      await this.prisma.jobBoardAccount.create({
        data: {
          board: 'HH',
          name: employer?.name ? `HH · ${employer.name}` : 'HeadHunter',
          credentials: credentials as Prisma.InputJsonValue,
          isActive: true,
        },
      });
    }

    await this.prisma.integrationStatus.upsert({
      where: { code: 'HH' },
      update: {
        configured: true,
        meta: { connectedAt: credentials.connectedAt, employer, manager } as Prisma.InputJsonValue,
      },
      create: { code: 'HH', name: 'HeadHunter', configured: true },
    });
    await this.prisma.integrationStatus.upsert({
      where: { code: 'HH_CHAT' },
      update: { configured: true },
      create: { code: 'HH_CHAT', name: 'Чат HeadHunter', configured: true },
    });

    return { ok: true, employer, manager };
  }

  async disconnect() {
    const account = await this.getAccount();
    if (account) {
      await this.prisma.jobBoardAccount.update({
        where: { id: account.id },
        data: { isActive: false, credentials: {} },
      });
    }
    await this.prisma.integrationStatus.updateMany({
      where: { code: { in: ['HH', 'HH_CHAT'] } },
      data: { configured: false },
    });
    return { ok: true };
  }

  async getAccessToken(): Promise<string | null> {
    const account = await this.getAccount();
    const creds = this.credsOf(account);
    if (creds.accessToken) {
      const expiresAt = creds.expiresAt ? new Date(creds.expiresAt).getTime() : 0;
      // Refresh ~2 minutes before expiry
      if (expiresAt && expiresAt - Date.now() < 120_000) {
        if (creds.refreshToken) {
          return this.refreshLocked(creds.refreshToken);
        }
      }
      return creds.accessToken;
    }
    return process.env.HH_ACCESS_TOKEN || process.env.HH_CHAT_TOKEN || null;
  }

  private refreshLocked(refreshToken: string) {
    if (!this.refreshLock) {
      this.refreshLock = this.refresh(refreshToken).finally(() => {
        this.refreshLock = null;
      });
    }
    return this.refreshLock;
  }

  private async refresh(refreshToken: string): Promise<string | null> {
    if (!this.clientConfigured()) return process.env.HH_ACCESS_TOKEN || null;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.HH_CLIENT_ID!,
      client_secret: process.env.HH_CLIENT_SECRET!,
    });
    const res = await fetch('https://api.hh.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'HH-User-Agent': hhUserAgent() },
      body,
    });
    if (!res.ok) {
      this.logger.warn(`HH refresh failed: ${res.status}`);
      return null;
    }
    const data: any = await res.json();
    const account = await this.getAccount();
    const prev = this.credsOf(account);
    const credentials: HhCreds = {
      ...prev,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: new Date(Date.now() + Number(data.expires_in || 1209600) * 1000).toISOString(),
      tokenType: data.token_type || 'bearer',
    };
    if (account) {
      await this.prisma.jobBoardAccount.update({
        where: { id: account.id },
        data: { credentials: credentials as Prisma.InputJsonValue },
      });
    }
    return credentials.accessToken || null;
  }

  private async fetchMe(accessToken: string) {
    try {
      const res = await fetch('https://api.hh.ru/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'HH-User-Agent': hhUserAgent(),
          Accept: 'application/json',
        },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  /** Stable hash helper (unused but handy for state binding). */
  hash(s: string) {
    return createHash('sha256').update(s).digest('hex').slice(0, 16);
  }
}
