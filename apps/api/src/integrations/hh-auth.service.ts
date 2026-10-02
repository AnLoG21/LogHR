import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/guards';
import { hhUserAgent, setHhTokenProvider } from './hh-token';

export type HhCreds = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  manager?: { id?: string; email?: string; firstName?: string; lastName?: string };
  employer?: { id?: string; name?: string };
  connectedAt?: string;
};

type OAuthMeta = {
  oauthState?: string;
  oauthStateAt?: string;
  mode?: 'company' | 'personal';
  userId?: string;
};

@Injectable()
export class HhAuthService implements OnModuleInit {
  private readonly logger = new Logger(HhAuthService.name);
  private refreshLocks = new Map<string, Promise<string | null>>();

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    setHhTokenProvider((userId) => this.getAccessToken(userId));
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

  private credsOf(raw: unknown): HhCreds {
    if (!raw || typeof raw !== 'object') return {};
    return raw as HhCreds;
  }

  private async getCompanyAccount() {
    return this.prisma.jobBoardAccount.findFirst({
      where: { board: 'HH', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getPersonal(userId: string) {
    return this.prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'HH' } },
    });
  }

  async companyStatus() {
    const account = await this.getCompanyAccount();
    const creds = this.credsOf(account?.credentials);
    const oauth = !!creds.accessToken;
    const env = !!process.env.HH_ACCESS_TOKEN;
    return {
      clientConfigured: this.clientConfigured(),
      connected: oauth || env,
      viaOAuth: oauth,
      viaEnv: env && !oauth,
      scope: 'company' as const,
      expiresAt: creds.expiresAt || null,
      manager: creds.manager || null,
      employer: creds.employer || null,
      connectedAt: creds.connectedAt || null,
      redirectUri: this.redirectUri(),
      userAgent: hhUserAgent(),
      note: !this.clientConfigured()
        ? 'Укажите HH_CLIENT_ID и HH_CLIENT_SECRET в настройках сервера'
        : oauth
          ? 'Корпоративный HeadHunter подключён (отклики и поиск для всей компании)'
          : env
            ? 'Используется токен из настроек сервера'
            : 'Администратор может подключить общий аккаунт компании',
    };
  }

  /** @deprecated alias for companyStatus — admin UI */
  status() {
    return this.companyStatus();
  }

  async personalStatus(userId: string) {
    const row = await this.getPersonal(userId);
    const creds = this.credsOf(row?.credentials);
    const connected = !!(row?.isActive && creds.accessToken);
    return {
      clientConfigured: this.clientConfigured(),
      connected,
      scope: 'personal' as const,
      expiresAt: creds.expiresAt || null,
      manager: creds.manager || null,
      employer: creds.employer || null,
      connectedAt: creds.connectedAt || row?.connectedAt?.toISOString() || null,
      redirectUri: this.redirectUri(),
      note: !this.clientConfigured()
        ? 'Администратор ещё не задал HH_CLIENT_ID / HH_CLIENT_SECRET'
        : connected
          ? 'Ваш аккаунт менеджера HH подключён — публикации и чат идут от вашего имени'
          : 'Подключите свой менеджерский аккаунт HH, чтобы публиковать и писать кандидатам от себя',
    };
  }

  async authorizeUrl(user: AuthUser, mode: 'company' | 'personal' = 'personal') {
    if (!this.clientConfigured()) {
      throw new BadRequestException('Не заданы HH_CLIENT_ID / HH_CLIENT_SECRET');
    }
    if (mode === 'company' && user.role !== SystemRole.ADMIN && user.role !== SystemRole.RECRUITMENT_LEAD) {
      throw new ForbiddenException('Корпоративный аккаунт может подключать только руководитель');
    }
    const state = randomBytes(24).toString('hex');
    const meta: OAuthMeta = {
      oauthState: state,
      oauthStateAt: new Date().toISOString(),
      mode,
      userId: user.id,
    };
    await this.prisma.integrationStatus.upsert({
      where: { code: 'HH' },
      update: { meta: meta as Prisma.InputJsonValue },
      create: { code: 'HH', name: 'HeadHunter', meta: meta as Prisma.InputJsonValue },
    });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.HH_CLIENT_ID!,
      redirect_uri: this.redirectUri(),
      state,
    });
    return { url: `https://hh.ru/oauth/authorize?${params}`, state, redirectUri: this.redirectUri(), mode };
  }

  async handleCallback(code?: string, state?: string) {
    if (!code) throw new BadRequestException('Нет кода авторизации');
    const row = await this.prisma.integrationStatus.findUnique({ where: { code: 'HH' } });
    const meta = (row?.meta || {}) as OAuthMeta;
    if (!state || !meta.oauthState || state !== meta.oauthState) {
      throw new BadRequestException('Неверный state — начните подключение заново');
    }
    const mode = meta.mode || 'company';
    const userId = meta.userId;

    const credentials = await this.exchangeCode(code);
    if (mode === 'personal') {
      if (!userId) throw new BadRequestException('Неизвестный пользователь для личного подключения');
      await this.savePersonal(userId, credentials);
      return { ok: true, mode, employer: credentials.employer, manager: credentials.manager, redirectPath: '/profile?hh=connected' };
    }

    await this.saveCompany(credentials);
    return { ok: true, mode: 'company', employer: credentials.employer, manager: credentials.manager, redirectPath: '/admin?hh=connected' };
  }

  private async exchangeCode(code: string): Promise<HhCreds> {
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
    const manager = me
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
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
      tokenType: tokenData.token_type || 'bearer',
      manager,
      employer,
      connectedAt: new Date().toISOString(),
    };
  }

  private async saveCompany(credentials: HhCreds) {
    const existing = await this.getCompanyAccount();
    const name = credentials.employer?.name ? `HH · ${credentials.employer.name}` : 'HeadHunter (компания)';
    if (existing) {
      await this.prisma.jobBoardAccount.update({
        where: { id: existing.id },
        data: { name, credentials: credentials as Prisma.InputJsonValue, isActive: true },
      });
    } else {
      await this.prisma.jobBoardAccount.create({
        data: { board: 'HH', name, credentials: credentials as Prisma.InputJsonValue, isActive: true },
      });
    }
    await this.prisma.integrationStatus.upsert({
      where: { code: 'HH' },
      update: {
        configured: true,
        meta: { connectedAt: credentials.connectedAt, employer: credentials.employer, manager: credentials.manager, scope: 'company' } as Prisma.InputJsonValue,
      },
      create: { code: 'HH', name: 'HeadHunter', configured: true },
    });
    await this.prisma.integrationStatus.upsert({
      where: { code: 'HH_CHAT' },
      update: { configured: true },
      create: { code: 'HH_CHAT', name: 'Чат HeadHunter', configured: true },
    });
  }

  private async savePersonal(userId: string, credentials: HhCreds) {
    const label = [credentials.manager?.lastName, credentials.manager?.firstName].filter(Boolean).join(' ')
      || credentials.manager?.email
      || 'Менеджер HH';
    await this.prisma.userIntegration.upsert({
      where: { userId_provider: { userId, provider: 'HH' } },
      update: {
        credentials: credentials as Prisma.InputJsonValue,
        isActive: true,
        label,
        connectedAt: new Date(),
      },
      create: {
        userId,
        provider: 'HH',
        credentials: credentials as Prisma.InputJsonValue,
        isActive: true,
        label,
        connectedAt: new Date(),
      },
    });
  }

  async disconnectCompany() {
    const account = await this.getCompanyAccount();
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

  async disconnectPersonal(userId: string) {
    await this.prisma.userIntegration.updateMany({
      where: { userId, provider: 'HH' },
      data: { isActive: false, credentials: {} },
    });
    return { ok: true };
  }

  /** Personal token preferred for acting user; company/env as fallback (sync, search). */
  async getAccessToken(userId?: string): Promise<string | null> {
    if (userId) {
      const personal = await this.getPersonal(userId);
      if (personal?.isActive) {
        const creds = this.credsOf(personal.credentials);
        const token = await this.ensureFresh(creds, `user:${userId}`, async (next) => {
          await this.prisma.userIntegration.update({
            where: { id: personal.id },
            data: { credentials: next as Prisma.InputJsonValue },
          });
        });
        if (token) return token;
      }
    }

    const account = await this.getCompanyAccount();
    if (account) {
      const creds = this.credsOf(account.credentials);
      const token = await this.ensureFresh(creds, `company:${account.id}`, async (next) => {
        await this.prisma.jobBoardAccount.update({
          where: { id: account.id },
          data: { credentials: next as Prisma.InputJsonValue },
        });
      });
      if (token) return token;
    }

    return process.env.HH_ACCESS_TOKEN || process.env.HH_CHAT_TOKEN || null;
  }

  private async ensureFresh(
    creds: HhCreds,
    lockKey: string,
    save: (next: HhCreds) => Promise<void>,
  ): Promise<string | null> {
    if (!creds.accessToken) return null;
    const expiresAt = creds.expiresAt ? new Date(creds.expiresAt).getTime() : 0;
    if (expiresAt && expiresAt - Date.now() < 120_000 && creds.refreshToken) {
      return this.refreshLocked(lockKey, creds.refreshToken, creds, save);
    }
    return creds.accessToken;
  }

  private refreshLocked(
    lockKey: string,
    refreshToken: string,
    prev: HhCreds,
    save: (next: HhCreds) => Promise<void>,
  ) {
    const existing = this.refreshLocks.get(lockKey);
    if (existing) return existing;
    const p = this.refresh(refreshToken, prev, save).finally(() => this.refreshLocks.delete(lockKey));
    this.refreshLocks.set(lockKey, p);
    return p;
  }

  private async refresh(
    refreshToken: string,
    prev: HhCreds,
    save: (next: HhCreds) => Promise<void>,
  ): Promise<string | null> {
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
    const next: HhCreds = {
      ...prev,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: new Date(Date.now() + Number(data.expires_in || 1209600) * 1000).toISOString(),
      tokenType: data.token_type || 'bearer',
    };
    await save(next);
    return next.accessToken || null;
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

  /** Team overview for lead/admin: who connected HH, mango, workload. */
  async teamOverview() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        role: true,
        phone: true,
        mangoExtension: true,
        orgUnit: { select: { id: true, name: true } },
        integrations: { where: { provider: 'HH', isActive: true }, take: 1 },
        _count: {
          select: {
            assignedCandidates: true,
            hiringRequestsRecruited: true,
            assignedTasks: { where: { status: 'OPEN' } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users.map((u) => {
      const hh = u.integrations[0];
      const creds = this.credsOf(hh?.credentials);
      return {
        id: u.id,
        email: u.email,
        name: [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' '),
        role: u.role,
        phone: u.phone,
        orgUnit: u.orgUnit,
        mangoExtension: u.mangoExtension,
        hh: {
          connected: !!(hh && creds.accessToken),
          manager: creds.manager || null,
          employer: creds.employer || null,
          connectedAt: creds.connectedAt || hh?.connectedAt?.toISOString() || null,
          label: hh?.label || null,
        },
        stats: {
          candidates: u._count.assignedCandidates,
          requests: u._count.hiringRequestsRecruited,
          openTasks: u._count.assignedTasks,
        },
      };
    });
  }

  async teamMemberDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        role: true,
        phone: true,
        mangoExtension: true,
        orgUnit: { select: { id: true, name: true } },
        integrations: { where: { provider: 'HH' }, take: 1 },
      },
    });
    if (!user) throw new BadRequestException('Сотрудник не найден');
    const candidates = await this.prisma.candidate.findMany({
      where: { assigneeId: id, isDepersonalized: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        stage: { select: { name: true } },
        vacancy: { select: { id: true, title: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    const creds = this.credsOf(user.integrations[0]?.credentials);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' '),
        role: user.role,
        phone: user.phone,
        mangoExtension: user.mangoExtension,
        orgUnit: user.orgUnit,
        hh: {
          connected: !!(user.integrations[0]?.isActive && creds.accessToken),
          manager: creds.manager || null,
          employer: creds.employer || null,
          connectedAt: creds.connectedAt || null,
        },
      },
      candidates,
    };
  }

  hash(s: string) {
    return createHash('sha256').update(s).digest('hex').slice(0, 16);
  }
}
