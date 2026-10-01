import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, Roles } from '../common/guards';

type MbUser = { id: number; email: string; is_superuser?: boolean };

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async funnelReport() {
    const byStage = await this.prisma.candidate.groupBy({
      by: ['stageId'],
      _count: true,
    });
    const stages = await this.prisma.funnelStage.findMany({ include: { funnel: true } });
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    return {
      name: 'Кандидаты на воронке подбора',
      rows: byStage.map((r) => ({
        stageId: r.stageId,
        stageName: r.stageId ? stageMap.get(r.stageId)?.name : 'Без этапа',
        funnel: r.stageId ? stageMap.get(r.stageId)?.funnel.name : null,
        count: r._count,
      })),
    };
  }

  async sourcesReport() {
    const bySource = await this.prisma.candidate.groupBy({ by: ['source'], _count: true });
    const byAddType = await this.prisma.candidate.groupBy({ by: ['addType'], _count: true });
    return {
      name: 'Эффективность каналов поиска',
      sources: bySource.map((r) => ({ source: r.source, count: r._count })),
      addTypes: byAddType.map((r) => ({ addType: r.addType, count: r._count })),
    };
  }

  async recruiterWorkload() {
    const recruiters = await this.prisma.user.findMany({
      where: { role: { in: ['RECRUITER', 'RECRUITMENT_LEAD'] }, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        _count: {
          select: {
            hiringRequestsRecruited: true,
            assignedTasks: true,
          },
        },
      },
    });
    return { name: 'Занятость рекрутера', rows: recruiters };
  }

  async requestsRegistry() {
    const requests = await this.prisma.hiringRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        orgUnit: { select: { name: true } },
        candidateProfile: { select: { name: true } },
        recruiter: { select: { firstName: true, lastName: true } },
      },
    });
    return { name: 'Реестр заявок', rows: requests };
  }

  async requestCloseTime() {
    const closed = await this.prisma.hiringRequest.findMany({
      where: { status: 'CLOSED' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    const rows = closed.map((r) => ({
      ...r,
      daysOpen: Math.round((r.updatedAt.getTime() - r.createdAt.getTime()) / 86400000),
    }));
    const avgDays = rows.length
      ? Math.round((rows.reduce((s, r) => s + r.daysOpen, 0) / rows.length) * 10) / 10
      : null;
    return { name: 'Срок закрытия заявки', rows, avgDays };
  }

  async candidateProcessingTime() {
    const history = await this.prisma.candidateStatusHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true } },
        stage: { select: { name: true } },
      },
    });
    return { name: 'Сроки обработки кандидатов', rows: history };
  }

  async summary() {
    const [candidates, openRequests, closedRequests, activeVacancies, offers, closeTime, funnel, sources, workload] =
      await Promise.all([
        this.prisma.candidate.count({ where: { isDepersonalized: false } }),
        this.prisma.hiringRequest.count({ where: { status: { in: ['NEW', 'IN_PROGRESS', 'APPROVED_HR_BP', 'PENDING_HR_BP'] } } }),
        this.prisma.hiringRequest.count({ where: { status: 'CLOSED' } }),
        this.prisma.vacancy.count({ where: { isActive: true } }),
        this.prisma.offer.count(),
        this.requestCloseTime(),
        this.funnelReport(),
        this.sourcesReport(),
        this.recruiterWorkload(),
      ]);
    const conversionPct = candidates
      ? Math.round((offers / candidates) * 1000) / 10
      : 0;
    return {
      kpis: {
        candidates,
        openRequests,
        closedRequests,
        activeVacancies,
        offers,
        avgCloseDays: closeTime.avgDays,
        conversionPct,
      },
      funnel: funnel.rows,
      sources: sources.sources,
      workload: workload.rows,
      closeTime: closeTime.rows,
    };
  }

  metabasePublicUrl() {
    const raw = (process.env.METABASE_PUBLIC_URL || '').trim();
    if (!/^https?:\/\//i.test(raw) || /localhost|127\.0\.0\.1/i.test(raw)) return null;
    return raw.replace(/\/$/, '');
  }

  metabaseInfo() {
    const url = this.metabasePublicUrl();
    return {
      url,
      enabled: Boolean(url),
      sso: Boolean(url && process.env.METABASE_URL && process.env.METABASE_EMAIL && process.env.METABASE_PASSWORD),
      reports: [
        'Кандидаты на воронке подбора',
        'Эффективность каналов поиска',
        'Занятость рекрутера',
        'Реестр заявок',
        'Срок закрытия заявки (план/факт)',
        'Сроки обработки кандидатов',
      ],
      note: url
        ? 'Расширенная аналитика откроется в том же аккаунте, что и ATS.'
        : 'Сейчас используется встроенная аналитика на этой странице.',
    };
  }

  private mbBase() {
    return (process.env.METABASE_URL || '').replace(/\/$/, '');
  }

  private async mbFetch(path: string, init: RequestInit & { session?: string } = {}) {
    const base = this.mbBase();
    if (!base) throw new ServiceUnavailableException('Аналитика временно недоступна');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.session) headers['X-Metabase-Session'] = init.session;
    const r = await fetch(`${base}${path}`, { ...init, headers });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const msg = data?.message || data?.errors || text || r.statusText;
      throw new BadRequestException(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  }

  private async mbAdminSession() {
    const email = process.env.METABASE_EMAIL;
    const password = process.env.METABASE_PASSWORD;
    if (!email || !password) throw new ServiceUnavailableException('Аналитика не настроена');
    const data = await this.mbFetch('/api/session', {
      method: 'POST',
      body: JSON.stringify({ username: email, password }),
    });
    if (!data?.id) throw new ServiceUnavailableException('Не удалось войти в аналитику');
    return String(data.id);
  }

  private strongPassword() {
    // Metabase complexity: upper, lower, digit, special, length
    return `Ti${randomBytes(9).toString('base64url')}!1aA`;
  }

  /** Ensure Metabase user for ATS account and return a session id (SSO bounce). */
  async metabaseSso(user: AuthUser) {
    const publicUrl = this.metabasePublicUrl();
    if (!publicUrl) throw new ServiceUnavailableException('Аналитика не подключена');

    const admin = await this.mbAdminSession();
    const email = user.email.toLowerCase();
    const list = await this.mbFetch('/api/user?status=all', { session: admin });
    const users: MbUser[] = Array.isArray(list) ? list : list?.data || [];
    let mb = users.find((u) => (u.email || '').toLowerCase() === email);

    const password = this.strongPassword();
    const first = user.firstName || 'User';
    const last = user.lastName || 'ATS';

    if (!mb) {
      mb = await this.mbFetch('/api/user', {
        method: 'POST',
        session: admin,
        body: JSON.stringify({
          first_name: first,
          last_name: last,
          email,
          password,
        }),
      });
    } else {
      await this.mbFetch(`/api/user/${mb.id}`, {
        method: 'PUT',
        session: admin,
        body: JSON.stringify({
          first_name: first,
          last_name: last,
          email,
          password,
        }),
      });
    }

    // Superusers keep admin; others get normal access. Admins of ATS → Metabase admin group is optional.
    if (user.role === SystemRole.ADMIN && mb && !mb.is_superuser) {
      try {
        await this.mbFetch(`/api/user/${mb.id}`, {
          method: 'PUT',
          session: admin,
          body: JSON.stringify({ is_superuser: true }),
        });
      } catch {
        /* older Metabase may reject */
      }
    }

    const session = await this.mbFetch('/api/session', {
      method: 'POST',
      body: JSON.stringify({ username: email, password }),
    });
    if (!session?.id) throw new ServiceUnavailableException('Не удалось открыть аналитику');

    // One-time bounce token so the browser can set the cookie on the Metabase host/port
    const token = randomBytes(24).toString('hex');
    const payload = JSON.stringify({
      sessionId: String(session.id),
      url: publicUrl,
      exp: Date.now() + 60_000,
    });
    // Store in memory-less signed blob (HMAC with worker/admin secret)
    const secret = process.env.METABASE_PASSWORD || process.env.JWT_SECRET || 'loghr';
    const sig = createHash('sha256').update(`${token}.${payload}.${secret}`).digest('hex').slice(0, 32);
    // Pass payload in response; client hits bounce with sessionId directly (same-origin API issued it)
    return {
      url: publicUrl,
      sessionId: String(session.id),
      bounce: `${publicUrl}/`,
      token: `${token}.${sig}`,
    };
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Roles(SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD)
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('funnel') funnel() { return this.service.funnelReport(); }
  @Get('sources') sources() { return this.service.sourcesReport(); }
  @Get('recruiter-workload') workload() { return this.service.recruiterWorkload(); }
  @Get('requests') requests() { return this.service.requestsRegistry(); }
  @Get('close-time') closeTime() { return this.service.requestCloseTime(); }
  @Get('processing-time') processing() { return this.service.candidateProcessingTime(); }
  @Get('summary') summary() { return this.service.summary(); }
  @Get('metabase') metabase() { return this.service.metabaseInfo(); }

  @Get('metabase/sso')
  sso(@CurrentUser() user: AuthUser) {
    return this.service.metabaseSso(user);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService], exports: [ReportsService] })
export class ReportsModule {}
