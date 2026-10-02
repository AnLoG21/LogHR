import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/guards';

/**
 * Mango Office ВАТС: click-to-call + события звонков.
 * Docs: POST https://app.mango-office.ru/vpbx/commands/callback
 * sign = sha256(vpbx_api_key + json + vpbx_api_salt)
 */
@Injectable()
export class MangoService implements OnModuleInit {
  private readonly logger = new Logger(MangoService.name);
  private readonly base = 'https://app.mango-office.ru/vpbx';

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (this.configured()) {
      this.prisma.integrationStatus
        .upsert({
          where: { code: 'TELEPHONY' },
          update: { configured: true, name: 'Mango Office' },
          create: { code: 'TELEPHONY', name: 'Mango Office', configured: true },
        })
        .catch(() => undefined);
    }
  }

  apiKey() {
    return process.env.MANGO_VPBX_API_KEY || process.env.TELEPHONY_API_KEY || '';
  }

  apiSalt() {
    return process.env.MANGO_VPBX_API_SALT || process.env.TELEPHONY_API_SALT || '';
  }

  lineNumber() {
    return process.env.MANGO_LINE_NUMBER || undefined;
  }

  configured() {
    return !!(this.apiKey() && this.apiSalt());
  }

  status() {
    return {
      configured: this.configured(),
      provider: 'mango',
      lineNumber: this.lineNumber() || null,
      eventsUrl: `${(process.env.WEB_URL || process.env.PUBLIC_URL || 'https://hrm.infiit.ru').replace(/\/$/, '')}/api/integrations/mango`,
      note: this.configured()
        ? 'Mango Office подключён. У каждого сотрудника в профиле укажите внутренний номер (extension).'
        : 'Задайте MANGO_VPBX_API_KEY и MANGO_VPBX_API_SALT (из кабинета Mango → Интеграции → API коннектор)',
    };
  }

  private sign(json: string) {
    return createHash('sha256').update(this.apiKey() + json + this.apiSalt()).digest('hex');
  }

  private async post(path: string, payload: Record<string, unknown>) {
    const json = JSON.stringify(payload);
    const body = new URLSearchParams({
      vpbx_api_key: this.apiKey(),
      sign: this.sign(json),
      json,
    });
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  }

  normalizePhone(phone: string) {
    let d = phone.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
    if (d.length === 10) d = `7${d}`;
    return d;
  }

  async clickToCall(phone: string, user: AuthUser) {
    if (!this.configured()) {
      return {
        ok: false,
        configured: false,
        provider: 'mango',
        message: 'Mango Office не настроен',
        deeplink: `tel:${phone.replace(/\D/g, '')}`,
      };
    }
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { mangoExtension: true, phone: true, firstName: true, lastName: true },
    });
    const extension = (me?.mangoExtension || '').trim();
    if (!extension) {
      return {
        ok: false,
        configured: true,
        provider: 'mango',
        message: 'Укажите свой внутренний номер Mango в разделе «Мой профиль»',
        deeplink: `tel:${phone.replace(/\D/g, '')}`,
      };
    }
    const to = this.normalizePhone(phone);
    if (to.length < 11) throw new BadRequestException('Некорректный номер кандидата');

    const commandId = `loghr-${randomUUID()}`;
    const payload: Record<string, unknown> = {
      command_id: commandId,
      from: { extension },
      to_number: to,
    };
    if (this.lineNumber()) payload.line_number = this.lineNumber();

    const res = await this.post('/commands/callback', payload);
    const resultCode = Number(res.data?.result ?? res.data?.code ?? 0);
    const ok = res.ok && (resultCode === 1000 || resultCode === 0);

    await this.prisma.notificationLog.create({
      data: {
        channel: 'TELEPHONY',
        to,
        subject: `Mango ${extension} → ${to}`,
        body: JSON.stringify({ commandId, userId: user.id, result: res.data }),
        status: ok ? 'SENT' : 'FAILED',
        error: ok ? null : String(res.data?.result || res.data?.raw || res.status),
      },
    });

    if (!ok) {
      this.logger.warn(`Mango callback failed: ${JSON.stringify(res.data).slice(0, 300)}`);
      return {
        ok: false,
        configured: true,
        provider: 'mango',
        commandId,
        result: res.data,
        message: `Mango не принял звонок (код ${resultCode || res.status}). Проверьте внутренний номер ${extension}.`,
        deeplink: `tel:${to}`,
      };
    }

    return {
      ok: true,
      configured: true,
      provider: 'mango',
      commandId,
      callId: commandId,
      extension,
      to,
      message: 'Сейчас зазвонит ваш телефон Mango — после ответа начнётся звонок кандидату',
      result: res.data,
    };
  }

  /** Входящие события от Mango (настроить URL в кабинете ВАТС). */
  async handleEvent(body: any, sign?: string) {
    const json = typeof body?.json === 'string' ? body.json : JSON.stringify(body?.json || body || {});
    if (this.configured() && sign) {
      const expected = this.sign(json);
      if (expected !== sign && body?.sign !== expected) {
        return { ok: false, error: 'invalid_sign' };
      }
    }
    let payload: any = {};
    try {
      payload = typeof json === 'string' ? JSON.parse(json) : json;
    } catch {
      payload = body;
    }
    const call = payload?.call || payload;
    const to = call?.to?.number || call?.to || '';
    const from = call?.from?.number || call?.from || call?.caller_number || '';
    const entry = call?.entry_result || call?.entry_id || call?.call_state || 'event';
    await this.prisma.notificationLog.create({
      data: {
        channel: 'TELEPHONY',
        to: String(to || from || 'mango'),
        subject: `Mango event ${entry}`,
        body: JSON.stringify(payload).slice(0, 8000),
        status: 'RECEIVED',
      },
    });
    return { ok: true };
  }

  async recentCalls(limit = 30) {
    return this.prisma.notificationLog.findMany({
      where: { channel: 'TELEPHONY' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
