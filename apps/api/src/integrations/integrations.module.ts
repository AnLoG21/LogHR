import { Body, Controller, Get, Injectable, Module, Post, Headers, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, Public, Roles } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import { aiProviders } from '../ai/ai.module';
import { HhAuthService } from './hh-auth.service';
import { hhUserAgent, resolveHhToken, withHhUser } from './hh-token';
import { MaxBotService } from './max-bot.service';
import { MangoService } from './mango.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private hhAuth: HhAuthService,
    private maxBot: MaxBotService,
    private mango: MangoService,
  ) {}

  async status() {
    const rows = await this.prisma.integrationStatus.findMany({ orderBy: { code: 'asc' } });
    let redisOk = false;
    if (process.env.REDIS_URL) {
      try {
        const IORedis = (await import('ioredis')).default;
        const r = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 800, lazyConnect: true });
        await r.connect();
        redisOk = (await r.ping()) === 'PONG';
        r.disconnect();
      } catch {
        redisOk = false;
      }
    }
    const hhToken = await resolveHhToken();
    const hhStatus = await this.hhAuth.status();
    const envMap: Record<string, boolean> = {
      HH: !!hhToken,
      SUPERJOB: !!process.env.SUPERJOB_TOKEN,
      AVITO: !!process.env.AVITO_TOKEN,
      ZARPLATA: !!process.env.ZARPLATA_TOKEN,
      SMTP: !!process.env.SMTP_HOST,
      SMS: !!process.env.SMS_API_KEY,
      TELEPHONY: this.mango.configured() || !!process.env.TELEPHONY_API_KEY,
      PROACTION: !!process.env.PROACTION_WEBHOOK_SECRET,
      REDIS: redisOk,
      S3: process.env.STORAGE_MODE === 's3' && !!process.env.S3_ENDPOINT,
      AI: aiProviders().length > 0,
      HH_CHAT: !!hhToken,
      MAX: this.maxBot.configured(),
      DADATA: !!(process.env.DADATA_TOKEN || process.env.DADATA_API_KEY),
    };
    return rows.map((r) => {
      const live = !!envMap[r.code];
      let note = live ? 'подключено' : 'не подключено';
      if (r.code === 'REDIS' && !live) note = 'очередь недоступна';
      if (r.code === 'HH') note = hhStatus.note;
      if (r.code === 'HH_CHAT') note = live ? 'доступен через HH' : 'нужно подключить HeadHunter';
      if (r.code === 'MAX') note = this.maxBot.status().note;
      if (r.code === 'TELEPHONY') note = this.mango.status().note;
      if (r.code === 'AI' && live) note = 'подключено';
      return {
        ...r,
        configured: r.configured || live,
        live,
        note,
        ...(r.code === 'HH' ? { hh: hhStatus } : {}),
        ...(r.code === 'MAX' ? { max: this.maxBot.status() } : {}),
        ...(r.code === 'TELEPHONY' ? { mango: this.mango.status() } : {}),
      };
    });
  }

  async ensureDefaults() {
    const defaults = [
      { code: 'HH', name: 'HeadHunter' },
      { code: 'SUPERJOB', name: 'SuperJob' },
      { code: 'AVITO', name: 'Avito Работа' },
      { code: 'ZARPLATA', name: 'Zarplata.ru' },
      { code: 'SMTP', name: 'Почта' },
      { code: 'SMS', name: 'SMS' },
      { code: 'TELEPHONY', name: 'Телефония' },
      { code: 'PROACTION', name: 'ProAction' },
      { code: 'REDIS', name: 'Очередь задач' },
      { code: 'S3', name: 'Файловое хранилище' },
      { code: 'AI', name: 'ИИ-помощник' },
      { code: 'HH_CHAT', name: 'Чат HeadHunter' },
      { code: 'MAX', name: 'MAX Мессенджер' },
      { code: 'DADATA', name: 'Подсказки адресов' },
    ];
    for (const d of defaults) {
      await this.prisma.integrationStatus.upsert({
        where: { code: d.code },
        update: { name: d.name },
        create: d,
      });
    }
  }

  async proActionWebhook(payload: any, secret?: string) {
    const expected = process.env.PROACTION_WEBHOOK_SECRET;
    if (expected && secret !== expected) {
      return { ok: false, error: 'invalid_secret' };
    }
    const candidateId = payload.candidateId || payload.externalCandidateId;
    if (!candidateId) return { ok: false, error: 'candidateId_required' };
    const result = await this.prisma.proActionResult.create({
      data: {
        candidateId,
        externalId: payload.id ? String(payload.id) : undefined,
        status: payload.status || 'COMPLETED',
        score: payload.score != null ? Number(payload.score) : undefined,
        payload,
      },
    });
    return { ok: true, result };
  }

  clickToCall(phone: string, user: AuthUser) {
    if (this.mango.configured() || (process.env.TELEPHONY_PROVIDER || '').toLowerCase() === 'mango') {
      return this.mango.clickToCall(phone, user);
    }
    const apiKey = process.env.TELEPHONY_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        configured: false,
        message: 'Телефония не настроена',
        deeplink: `tel:${phone.replace(/\D/g, '')}`,
      };
    }
    return {
      ok: true,
      configured: true,
      provider: process.env.TELEPHONY_PROVIDER || 'mock',
      callId: `tel-${Date.now()}`,
      deeplink: `tel:${phone.replace(/\D/g, '')}`,
    };
  }

  /** HH Chat: personal token of current user preferred */
  async hhChat(candidateId: string, userId?: string) {
    return withHhUser(userId, async () => {
    const token = await resolveHhToken(userId);
    if (!token) {
      return {
        configured: false,
        live: false,
        messages: [],
        note: 'Чат HeadHunter пока не подключён. Можно написать в WhatsApp или Telegram.',
      };
    }

    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        responses: { where: { board: 'HH' }, orderBy: { receivedAt: 'desc' }, take: 5 },
      },
    });
    if (!candidate) {
      return { configured: true, live: false, messages: [], note: 'Кандидат не найден', error: 'not_found' };
    }

    const negotiationId =
      candidate.externalId ||
      candidate.responses.find((r) => r.externalId)?.externalId ||
      null;

    if (!negotiationId) {
      return {
        configured: true,
        live: false,
        candidateId,
        negotiationId: null,
        messages: [],
        note: 'Нет связи с перепиской HeadHunter. Синхронизируйте отклик или откройте чат на сайте HH.',
      };
    }

    try {
      const res = await fetch(`https://api.hh.ru/negotiations/${encodeURIComponent(negotiationId)}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'HH-User-Agent': hhUserAgent(),
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        await res.text().catch(() => '');
        return {
          configured: true,
          live: false,
          candidateId,
          negotiationId,
          messages: [],
          note: res.status === 401 || res.status === 403
            ? 'Нет доступа к переписке HeadHunter. Проверьте подключение аккаунта.'
            : 'Не удалось загрузить переписку HeadHunter. Попробуйте позже.',
          error: `hh_${res.status}`,
        };
      }
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.items || data.messages || [];
      const messages = items.map((m: any) => ({
        id: String(m.id ?? m.message_id ?? Math.random()),
        text: m.text || m.message || '',
        createdAt: m.created_at || m.date || m.createdAt || null,
        fromEmployer: !!(m.author?.participant_type === 'employer' || m.from_employer || m.side === 'employer'),
        raw: m,
      }));
      return {
        configured: true,
        live: true,
        candidateId,
        negotiationId,
        messages,
        note: messages.length ? `Загружено ${messages.length} сообщ.` : 'Переписка пуста',
      };
    } catch (e: any) {
      return {
        configured: true,
        live: false,
        candidateId,
        negotiationId,
        messages: [],
        note: e?.message || 'Ошибка запроса к HH Chat API',
        error: 'network',
      };
    }
    });
  }

  async sendHhChat(candidateId: string, text: string, userId?: string) {
    const token = await resolveHhToken(userId);
    if (!token) {
      return { ok: false, configured: false, note: 'Чат HeadHunter не подключён' };
    }
    if (!text?.trim()) return { ok: false, note: 'Пустое сообщение' };

    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { responses: { where: { board: 'HH' }, orderBy: { receivedAt: 'desc' }, take: 5 } },
    });
    const negotiationId =
      candidate?.externalId ||
      candidate?.responses.find((r) => r.externalId)?.externalId ||
      null;
    if (!negotiationId) {
      return { ok: false, note: 'Нет связи с перепиской HeadHunter у этого кандидата' };
    }

    const body = new URLSearchParams({ message: text.trim() });
    const res = await fetch(`https://api.hh.ru/negotiations/${encodeURIComponent(negotiationId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'HH-User-Agent': hhUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, status: res.status, note: errText.slice(0, 300) || res.statusText };
    }
    return { ok: true, negotiationId };
  }

  async dadataSuggest(query: string, count = 7) {
    const token = process.env.DADATA_TOKEN || process.env.DADATA_API_KEY;
    if (!token) {
      return {
        configured: false,
        suggestions: [],
        note: 'Подсказки адреса недоступны — введите вручную.',
      };
    }
    if (!query?.trim()) return { configured: true, suggestions: [] };
    try {
      const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({ query: query.trim(), count }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { configured: true, suggestions: [], note: `DaData ${res.status}: ${text.slice(0, 160)}` };
      }
      const data = await res.json();
      const suggestions = (data.suggestions || []).map((s: any) => ({
        value: s.value as string,
        unrestricted: s.unrestricted_value as string,
        city: s.data?.city || s.data?.settlement || null,
        region: s.data?.region_with_type || s.data?.region || null,
        postalCode: s.data?.postal_code || null,
        geoLat: s.data?.geo_lat || null,
        geoLon: s.data?.geo_lon || null,
        raw: s.data,
      }));
      return { configured: true, suggestions, note: suggestions.length ? undefined : 'Ничего не найдено' };
    } catch (e: any) {
      return { configured: true, suggestions: [], note: e?.message || 'Ошибка DaData' };
    }
  }
}

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private service: IntegrationsService,
    private hhAuth: HhAuthService,
    private maxBot: MaxBotService,
    private mango: MangoService,
  ) {}

  @ApiBearerAuth()
  @Get('status')
  async status() {
    await this.service.ensureDefaults();
    return this.service.status();
  }

  /** Company HH (admin) */
  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Get('hh/status')
  hhStatus() {
    return this.hhAuth.companyStatus();
  }

  /** Personal HH for current user */
  @ApiBearerAuth()
  @Get('hh/me')
  hhMe(@CurrentUser() user: AuthUser) {
    return this.hhAuth.personalStatus(user.id);
  }

  @ApiBearerAuth()
  @Get('hh/authorize')
  async hhAuthorize(@CurrentUser() user: AuthUser, @Query('mode') mode?: string) {
    return this.hhAuth.authorizeUrl(user, mode === 'company' ? 'company' : 'personal');
  }

  @Public()
  @Get('hh/callback')
  async hhCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const web = this.hhAuth.publicBaseUrl();
    if (error) {
      return res.redirect(`${web}/profile?hh=error&msg=${encodeURIComponent(error)}`);
    }
    try {
      const result = await this.hhAuth.handleCallback(code, state);
      return res.redirect(`${web}${result.redirectPath || '/profile?hh=connected'}`);
    } catch (e: any) {
      return res.redirect(`${web}/profile?hh=error&msg=${encodeURIComponent(e?.message || 'Ошибка HH')}`);
    }
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Post('hh/disconnect')
  hhDisconnect() {
    return this.hhAuth.disconnectCompany();
  }

  @ApiBearerAuth()
  @Post('hh/me/disconnect')
  hhMeDisconnect(@CurrentUser() user: AuthUser) {
    return this.hhAuth.disconnectPersonal(user.id);
  }

  /** Lead / admin: team & their HH / Mango */
  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD, SystemRole.HR_BP)
  @Get('team')
  team() {
    return this.hhAuth.teamOverview();
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD, SystemRole.HR_BP)
  @Get('team/:userId')
  teamMember(@Param('userId') userId: string) {
    return this.hhAuth.teamMemberDetail(userId);
  }

  @ApiBearerAuth()
  @Get('mango/status')
  mangoStatus() {
    return this.mango.status();
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Get('mango/calls')
  mangoCalls(@Query('limit') limit?: string) {
    return this.mango.recentCalls(limit ? Number(limit) : 30);
  }

  @Public()
  @Post('mango/events')
  mangoEvents(@Body() body: any, @Headers('x-sign') sign?: string) {
    return this.mango.handleEvent(body, sign || body?.sign);
  }

  /** Mango дописывает к URL: /events/call, /events/summary, /events/recording … */
  @Public()
  @Post('mango/events/:kind')
  mangoEventsKind(@Body() body: any, @Headers('x-sign') sign?: string) {
    return this.mango.handleEvent(body, sign || body?.sign);
  }

  @Public()
  @Post('mango/result/:kind')
  mangoResult(@Body() body: any, @Headers('x-sign') sign?: string) {
    return this.mango.handleEvent(body, sign || body?.sign);
  }

  @ApiBearerAuth()
  @Get('max/status')
  maxStatus() {
    return this.maxBot.status();
  }

  @ApiBearerAuth()
  @Get('max/inbox')
  maxInbox() {
    return this.maxBot.inbox();
  }

  @ApiBearerAuth()
  @Post('max/inbox/read-all')
  maxInboxReadAll() {
    return this.maxBot.markAllRead();
  }

  @ApiBearerAuth()
  @Post('max-chat/:candidateId/read')
  maxChatRead(@Param('candidateId') candidateId: string) {
    return this.maxBot.markRead(candidateId);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN)
  @Post('max/register-webhook')
  maxRegisterWebhook() {
    return this.maxBot.ensureWebhook();
  }

  @ApiBearerAuth()
  @Get('max-chat/:candidateId')
  maxChat(@Param('candidateId') candidateId: string) {
    return this.maxBot.chat(candidateId);
  }

  @ApiBearerAuth()
  @Post('max-chat/:candidateId')
  maxSend(@Param('candidateId') candidateId: string, @Body('text') text: string) {
    return this.maxBot.send(candidateId, text);
  }

  @Public()
  @Post('max/webhook')
  maxWebhook(@Body() body: any, @Headers('x-max-bot-api-secret') secret?: string) {
    return this.maxBot.handleUpdate(body, secret);
  }

  @Public()
  @Post('proaction/webhook')
  webhook(@Body() body: any, @Headers('x-proaction-secret') secret?: string) {
    return this.service.proActionWebhook(body, secret);
  }

  @ApiBearerAuth()
  @Post('telephony/call')
  call(@Body('phone') phone: string, @CurrentUser() user: AuthUser) {
    return this.service.clickToCall(phone, user);
  }

  @ApiBearerAuth()
  @Get('hh-chat/:candidateId')
  hhChat(@Param('candidateId') candidateId: string, @CurrentUser() user: AuthUser) {
    return this.service.hhChat(candidateId, user.id);
  }

  @ApiBearerAuth()
  @Post('hh-chat/:candidateId')
  sendHhChat(@Param('candidateId') candidateId: string, @Body('text') text: string, @CurrentUser() user: AuthUser) {
    return this.service.sendHhChat(candidateId, text, user.id);
  }

  @ApiBearerAuth()
  @Get('dadata/suggest')
  dadataSuggest(@Query('q') q?: string, @Query('count') count?: string) {
    return this.service.dadataSuggest(q || '', count ? Number(count) : 7);
  }
}

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, HhAuthService, MaxBotService, MangoService],
  exports: [IntegrationsService, HhAuthService, MaxBotService, MangoService],
})
export class IntegrationsModule {}
