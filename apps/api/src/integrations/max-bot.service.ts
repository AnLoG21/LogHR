import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const API = 'https://platform-api2.max.ru';

type MaxExtra = {
  maxUserId?: number;
  maxChatId?: number;
  maxUsername?: string;
  maxLinkedAt?: string;
  maxThread?: Array<{ id: string; text: string; fromBot: boolean; at: string }>;
};

@Injectable()
export class MaxBotService implements OnModuleInit {
  private readonly logger = new Logger(MaxBotService.name);

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // Fire-and-forget webhook registration
    this.ensureWebhook().catch((e) => this.logger.warn(`MAX webhook: ${e?.message || e}`));
  }

  configured() {
    return !!(process.env.MAX_BOT_TOKEN && process.env.MAX_BOT_USERNAME);
  }

  token() {
    return process.env.MAX_BOT_TOKEN || '';
  }

  botUsername() {
    return (process.env.MAX_BOT_USERNAME || '').replace(/^@/, '');
  }

  webhookSecret() {
    return process.env.MAX_WEBHOOK_SECRET || '';
  }

  publicBase() {
    return (process.env.WEB_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '');
  }

  inviteLink(candidateId: string) {
    const bot = this.botUsername();
    if (!bot) return null;
    const payload = `c_${candidateId.replace(/-/g, '').slice(0, 32)}`;
    return `https://max.ru/${bot}?start=${payload}`;
  }

  shareLink(text: string) {
    return `https://max.ru/:share?text=${encodeURIComponent(text.slice(0, 500))}`;
  }

  status() {
    return {
      configured: this.configured(),
      botUsername: this.botUsername() || null,
      webhookUrl: this.publicBase() ? `${this.publicBase()}/api/integrations/max/webhook` : null,
      note: this.configured()
        ? 'Бот MAX подключён — кандидату отправьте ссылку-приглашение из карточки'
        : 'Задайте MAX_BOT_TOKEN и MAX_BOT_USERNAME в настройках сервера (платформа dev.max.ru)',
    };
  }

  private headers() {
    return {
      Authorization: this.token(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async ensureWebhook() {
    if (!this.configured() || !this.publicBase()) return { ok: false, note: 'not_configured' };
    const url = `${this.publicBase()}/api/integrations/max/webhook`;
    const body: any = {
      url,
      update_types: ['message_created', 'bot_started'],
    };
    if (this.webhookSecret()) body.secret = this.webhookSecret();
    const res = await fetch(`${API}/subscriptions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      this.logger.warn(`MAX subscribe failed ${res.status}: ${text.slice(0, 200)}`);
      return { ok: false, status: res.status, note: text.slice(0, 200) };
    }
    this.logger.log(`MAX webhook subscribed: ${url}`);
    await this.prisma.integrationStatus.upsert({
      where: { code: 'MAX' },
      update: { configured: true, name: 'MAX Мессенджер' },
      create: { code: 'MAX', name: 'MAX Мессенджер', configured: true },
    });
    return { ok: true };
  }

  private extraOf(c: { extra: unknown }): MaxExtra {
    return c.extra && typeof c.extra === 'object' ? (c.extra as MaxExtra) : {};
  }

  private async findByStartPayload(payload?: string) {
    if (!payload?.startsWith('c_')) return null;
    const compact = payload.slice(2).toLowerCase();
    if (compact.length < 8) return null;
    // Candidate UUIDs without dashes — match by startsWith on stripped id
    const all = await this.prisma.candidate.findMany({
      where: { isDepersonalized: false },
      select: { id: true, firstName: true, lastName: true, phone: true, extra: true },
      take: 500,
      orderBy: { updatedAt: 'desc' },
    });
    return all.find((c) => c.id.replace(/-/g, '').toLowerCase().startsWith(compact)) || null;
  }

  private async findByPhone(raw?: string) {
    const digits = (raw || '').replace(/\D/g, '');
    if (digits.length < 10) return null;
    const tail = digits.slice(-10);
    const list = await this.prisma.candidate.findMany({
      where: { phone: { not: null }, isDepersonalized: false },
      select: { id: true, firstName: true, lastName: true, phone: true, extra: true },
      take: 500,
      orderBy: { updatedAt: 'desc' },
    });
    return list.find((c) => (c.phone || '').replace(/\D/g, '').endsWith(tail)) || null;
  }

  private async saveLink(candidateId: string, userId: number, chatId?: number, username?: string) {
    const c = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!c) return;
    const extra: MaxExtra = {
      ...this.extraOf(c),
      maxUserId: userId,
      maxChatId: chatId,
      maxUsername: username,
      maxLinkedAt: new Date().toISOString(),
    };
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: { extra: extra as Prisma.InputJsonValue },
    });
  }

  private async pushThread(candidateId: string, entry: { id: string; text: string; fromBot: boolean; at: string }) {
    const c = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!c) return;
    const extra = this.extraOf(c);
    const thread = [...(extra.maxThread || []), entry].slice(-80);
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: { extra: { ...extra, maxThread: thread } as Prisma.InputJsonValue },
    });
  }

  async handleUpdate(update: any, secretHeader?: string) {
    const expected = this.webhookSecret();
    if (expected && secretHeader !== expected) {
      return { ok: false, error: 'invalid_secret' };
    }
    const type = update?.update_type || update?.updateType;
    const user = update?.user || update?.message?.sender || update?.message?.recipient;
    const userId = Number(user?.user_id || user?.userId || 0) || undefined;
    const chatId = Number(update?.chat_id || update?.message?.recipient?.chat_id || 0) || undefined;

    if (type === 'bot_started') {
      const payload = String(update?.payload || update?.start_payload || '');
      let candidate = await this.findByStartPayload(payload);
      if (!candidate && userId) {
        // already linked?
        const linked = await this.findByMaxUser(userId);
        if (linked) candidate = linked;
      }
      if (candidate && userId) {
        await this.saveLink(candidate.id, userId, chatId, user?.username);
        await this.sendText(userId, `Здравствуйте! Вы связаны с кандидатом ${candidate.lastName} ${candidate.firstName} в системе подбора. Можно писать сюда — сообщение увидит рекрутер.`);
        await this.pushThread(candidate.id, {
          id: `sys-${Date.now()}`,
          text: 'Кандидат открыл бота MAX и связал переписку',
          fromBot: true,
          at: new Date().toISOString(),
        });
        return { ok: true, linked: candidate.id };
      }
      if (userId) {
        await this.sendText(userId, 'Откройте персональную ссылку из письма или от рекрутера, чтобы связать этот чат с вашей карточкой.');
      }
      return { ok: true, linked: null };
    }

    if (type === 'message_created') {
      const msg = update?.message;
      const text = String(msg?.body?.text || msg?.text || '').trim();
      const contactPhone =
        msg?.body?.attachments?.find?.((a: any) => a.type === 'contact')?.payload?.vcf_info ||
        msg?.body?.attachments?.find?.((a: any) => a.type === 'contact')?.payload?.phone ||
        '';
      let candidate = userId ? await this.findByMaxUser(userId) : null;
      if (!candidate && contactPhone) candidate = await this.findByPhone(String(contactPhone));
      if (candidate && userId) {
        await this.saveLink(candidate.id, userId, chatId, user?.username);
        if (text) {
          await this.pushThread(candidate.id, {
            id: String(msg?.body?.mid || msg?.id || Date.now()),
            text,
            fromBot: false,
            at: new Date(msg?.timestamp || Date.now()).toISOString(),
          });
          await this.prisma.comment.create({
            data: {
              candidateId: candidate.id,
              body: `[MAX] ${text}`,
            },
          });
        }
        return { ok: true, candidateId: candidate.id };
      }
      return { ok: true, unmatched: true };
    }

    return { ok: true, ignored: type };
  }

  private async findByMaxUser(userId: number) {
    const list = await this.prisma.candidate.findMany({
      where: { isDepersonalized: false },
      select: { id: true, firstName: true, lastName: true, phone: true, extra: true },
      take: 800,
      orderBy: { updatedAt: 'desc' },
    });
    return list.find((c) => this.extraOf(c).maxUserId === userId) || null;
  }

  async chat(candidateId: string) {
    const c = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!c) return { configured: this.configured(), linked: false, messages: [], note: 'Кандидат не найден' };
    const extra = this.extraOf(c);
    const invite = this.inviteLink(candidateId);
    const share = this.shareLink(
      `Здравствуйте, ${c.firstName}! Напишите нам в MAX: ${invite || 'ссылка будет позже'}`,
    );
    if (!this.configured()) {
      return {
        configured: false,
        linked: false,
        messages: [],
        invite: null,
        share,
        note: 'Бот MAX не настроен. Администратор задаёт MAX_BOT_TOKEN и MAX_BOT_USERNAME на сервере.',
      };
    }
    const linked = !!extra.maxUserId;
    return {
      configured: true,
      linked,
      maxUserId: extra.maxUserId || null,
      invite,
      share,
      botUsername: this.botUsername(),
      messages: (extra.maxThread || []).slice().reverse(),
      note: linked
        ? 'Переписка через бота MAX связана с кандидатом'
        : 'Отправьте кандидату ссылку-приглашение. Когда он откроет бота, переписка появится здесь.',
    };
  }

  async send(candidateId: string, text: string) {
    if (!this.configured()) return { ok: false, note: 'Бот MAX не настроен' };
    if (!text?.trim()) return { ok: false, note: 'Пустое сообщение' };
    const c = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!c) return { ok: false, note: 'Кандидат не найден' };
    const extra = this.extraOf(c);
    if (!extra.maxUserId) {
      return {
        ok: false,
        note: 'Сначала отправьте кандидату ссылку-приглашение и дождитесь, пока он откроет бота',
        invite: this.inviteLink(candidateId),
      };
    }
    const sent = await this.sendText(extra.maxUserId, text.trim());
    if (!sent.ok) return sent;
    await this.pushThread(candidateId, {
      id: `out-${Date.now()}`,
      text: text.trim(),
      fromBot: true,
      at: new Date().toISOString(),
    });
    await this.prisma.notificationLog.create({
      data: {
        channel: 'MAX',
        to: String(extra.maxUserId),
        subject: candidateId,
        body: text.trim(),
        status: 'SENT',
      },
    });
    return { ok: true };
  }

  private async sendText(userId: number, text: string) {
    const res = await fetch(`${API}/messages?user_id=${userId}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return { ok: false, status: res.status, note: err.slice(0, 300) || res.statusText };
    }
    return { ok: true };
  }
}
