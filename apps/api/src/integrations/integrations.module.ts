import { Body, Controller, Get, Injectable, Module, Post, Headers, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';
import { aiProviders } from '../ai/ai.module';
import { HhAuthService } from './hh-auth.service';
import { hhUserAgent, resolveHhToken } from './hh-token';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService, private hhAuth: HhAuthService) {}

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
      TELEPHONY: !!process.env.TELEPHONY_API_KEY,
      PROACTION: !!process.env.PROACTION_WEBHOOK_SECRET,
      REDIS: redisOk,
      S3: process.env.STORAGE_MODE === 's3' && !!process.env.S3_ENDPOINT,
      AI: aiProviders().length > 0,
      HH_CHAT: !!hhToken,
      DADATA: !!(process.env.DADATA_TOKEN || process.env.DADATA_API_KEY),
    };
    return rows.map((r) => {
      const live = !!envMap[r.code];
      let note = live ? 'подключено' : 'не подключено';
      if (r.code === 'REDIS' && !live) note = 'очередь недоступна';
      if (r.code === 'HH') note = hhStatus.note;
      if (r.code === 'HH_CHAT') note = live ? 'доступен через HH' : 'нужно подключить HeadHunter';
      if (r.code === 'AI' && live) note = 'подключено';
      return {
        ...r,
        configured: r.configured || live,
        live,
        note,
        ...(r.code === 'HH' ? { hh: hhStatus } : {}),
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

  clickToCall(phone: string) {
    const provider = process.env.TELEPHONY_PROVIDER || 'mock';
    const apiKey = process.env.TELEPHONY_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        configured: false,
        message: 'Телефония не настроена (TELEPHONY_API_KEY)',
        deeplink: `tel:${phone.replace(/\D/g, '')}`,
      };
    }
    return {
      ok: true,
      configured: true,
      provider,
      callId: `${provider}-${Date.now()}`,
      deeplink: `tel:${phone.replace(/\D/g, '')}`,
    };
  }

  /** HH Chat: uses OAuth token or HH_ACCESS_TOKEN / HH_CHAT_TOKEN */
  async hhChat(candidateId: string) {
    const token = await resolveHhToken();
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
  }

  async sendHhChat(candidateId: string, text: string) {
    const token = await resolveHhToken();
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
  constructor(private service: IntegrationsService, private hhAuth: HhAuthService) {}

  @ApiBearerAuth()
  @Get('status')
  async status() {
    await this.service.ensureDefaults();
    return this.service.status();
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN)
  @Get('hh/status')
  hhStatus() {
    return this.hhAuth.status();
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN)
  @Get('hh/authorize')
  async hhAuthorize() {
    return this.hhAuth.authorizeUrl();
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
      return res.redirect(`${web}/admin?hh=error&msg=${encodeURIComponent(error)}`);
    }
    try {
      await this.hhAuth.handleCallback(code, state);
      return res.redirect(`${web}/admin?hh=connected`);
    } catch (e: any) {
      return res.redirect(`${web}/admin?hh=error&msg=${encodeURIComponent(e?.message || 'Ошибка HH')}`);
    }
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN)
  @Post('hh/disconnect')
  hhDisconnect() {
    return this.hhAuth.disconnect();
  }

  @Public()
  @Post('proaction/webhook')
  webhook(@Body() body: any, @Headers('x-proaction-secret') secret?: string) {
    return this.service.proActionWebhook(body, secret);
  }

  @ApiBearerAuth()
  @Post('telephony/call')
  call(@Body('phone') phone: string) {
    return this.service.clickToCall(phone);
  }

  @ApiBearerAuth()
  @Get('hh-chat/:candidateId')
  hhChat(@Param('candidateId') candidateId: string) {
    return this.service.hhChat(candidateId);
  }

  @ApiBearerAuth()
  @Post('hh-chat/:candidateId')
  sendHhChat(@Param('candidateId') candidateId: string, @Body('text') text: string) {
    return this.service.sendHhChat(candidateId, text);
  }

  @ApiBearerAuth()
  @Get('dadata/suggest')
  dadataSuggest(@Query('q') q?: string, @Query('count') count?: string) {
    return this.service.dadataSuggest(q || '', count ? Number(count) : 7);
  }
}

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, HhAuthService],
  exports: [IntegrationsService, HhAuthService],
})
export class IntegrationsModule {}
