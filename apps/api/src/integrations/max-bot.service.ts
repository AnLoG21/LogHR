import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/guards';
import { visibilityWhere } from '../common/visibility';

const API = 'https://platform-api2.max.ru';

type MaxExtra = {
  maxUserId?: number;
  maxChatId?: number;
  maxUsername?: string;
  maxLinkedAt?: string;
  maxUnread?: number;
  maxLastInbound?: { id: string; text: string; at: string };
  maxThread?: Array<{ id: string; text: string; fromBot: boolean; at: string }>;
};

type CandidateLite = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName?: string | null;
  phone?: string | null;
  extra: unknown;
};

@Injectable()
export class MaxBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaxBotService.name);
  private polling = false;
  private stopped = false;
  private marker: number | undefined;
  private lastPollAt: string | null = null;
  private lastPollError: string | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (!this.configured()) return;
    if (this.mode() === 'webhook') {
      this.ensureWebhook().catch((e) => this.logger.warn(`MAX webhook: ${e?.message || e}`));
    } else {
      this.startPolling().catch((e) => this.logger.warn(`MAX polling: ${e?.message || e}`));
    }
  }

  onModuleDestroy() {
    this.stopped = true;
  }

  /** polling — сервер сам забирает сообщения (работает без входящего доступа из интернета) */
  mode(): 'polling' | 'webhook' {
    return process.env.MAX_DELIVERY === 'webhook' ? 'webhook' : 'polling';
  }

  private async startPolling() {
    if (this.polling) return;
    this.polling = true;
    await this.dropSubscriptions();
    await this.prisma.integrationStatus
      .upsert({
        where: { code: 'MAX' },
        update: { configured: true, name: 'MAX Мессенджер' },
        create: { code: 'MAX', name: 'MAX Мессенджер', configured: true },
      })
      .catch(() => undefined);
    this.logger.log('MAX long polling started');
    void this.pollLoop();
  }

  private async dropSubscriptions() {
    try {
      const res = await fetch(`${API}/subscriptions`, { headers: this.headers() });
      const data: any = await res.json().catch(() => ({}));
      for (const s of data?.subscriptions || []) {
        if (!s?.url) continue;
        await fetch(`${API}/subscriptions?url=${encodeURIComponent(s.url)}`, {
          method: 'DELETE',
          headers: this.headers(),
        }).catch(() => undefined);
      }
    } catch (e: any) {
      this.logger.warn(`MAX unsubscribe: ${e?.message || e}`);
    }
  }

  private async pollLoop() {
    while (!this.stopped) {
      try {
        const params = new URLSearchParams({ limit: '100', timeout: '25', types: 'message_created,bot_started' });
        if (this.marker != null) params.set('marker', String(this.marker));
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 40_000);
        const res = await fetch(`${API}/updates?${params}`, { headers: this.headers(), signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${t.slice(0, 150)}`);
        }
        const data: any = await res.json();
        if (data?.marker != null) this.marker = Number(data.marker);
        for (const u of data?.updates || []) {
          try {
            await this.processUpdate(u);
          } catch (e: any) {
            this.logger.warn(`MAX update failed: ${e?.message || e}`);
          }
        }
        this.lastPollAt = new Date().toISOString();
        this.lastPollError = null;
      } catch (e: any) {
        if (this.stopped) break;
        this.lastPollError = e?.name === 'AbortError' ? null : String(e?.message || e);
        if (this.lastPollError) this.logger.warn(`MAX poll: ${this.lastPollError}`);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
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
    const payload = `c_${candidateId.replace(/-/g, '').toLowerCase()}`;
    return `https://max.ru/${bot}?start=${payload}`;
  }

  shareLink(text: string) {
    return `https://max.ru/:share?text=${encodeURIComponent(text.slice(0, 500))}`;
  }

  status() {
    return {
      configured: this.configured(),
      botUsername: this.botUsername() || null,
      mode: this.mode(),
      webhookUrl: this.publicBase() ? `${this.publicBase()}/api/integrations/max/webhook` : null,
      lastPollAt: this.lastPollAt,
      lastPollError: this.lastPollError,
      note: this.configured()
        ? this.mode() === 'polling'
          ? this.lastPollError
            ? `Бот подключён, но не удаётся получить сообщения: ${this.lastPollError}`
            : 'Бот MAX подключён — сообщения забираются автоматически'
          : 'Бот MAX подключён (webhook) — кандидату отправьте ссылку-приглашение из карточки'
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

  private vis(user: AuthUser): Prisma.CandidateWhereInput {
    return visibilityWhere({
      id: user.id,
      role: user.role as any,
      orgUnitId: (user as any).orgUnitId,
      visibilityRules: (user as any).visibilityRules,
    });
  }

  private async assertCandidateAccess(candidateId: string, user: AuthUser) {
    const c = await this.prisma.candidate.findFirst({
      where: { id: candidateId, isDepersonalized: false, AND: [this.vis(user)] },
      select: { id: true, firstName: true, lastName: true, middleName: true, phone: true, extra: true },
    });
    if (!c) throw new ForbiddenException('Нет доступа к кандидату или он не найден');
    return c;
  }

  /** MAX timestamp: seconds or ms → ISO */
  private normalizeAt(raw: unknown): string {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  /** c_<32 hex> → UUID */
  private uuidFromCompact(compact: string): string | null {
    const c = compact.toLowerCase().replace(/[^0-9a-f]/g, '');
    if (c.length !== 32) return null;
    return `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;
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
    return c.extra && typeof c.extra === 'object' && !Array.isArray(c.extra) ? (c.extra as MaxExtra) : {};
  }

  private async findByStartPayload(payload?: string) {
    if (!payload?.startsWith('c_')) return null;
    const uuid = this.uuidFromCompact(payload.slice(2));
    if (!uuid) return null;
    return this.prisma.candidate.findFirst({
      where: { id: uuid, isDepersonalized: false },
      select: { id: true, firstName: true, lastName: true, phone: true, extra: true },
    });
  }

  private async findByPhone(raw?: string) {
    const digits = (raw || '').replace(/\D/g, '');
    if (digits.length < 10) return null;
    const tail = digits.slice(-10);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Candidate"
      WHERE "isDepersonalized" = false
        AND phone IS NOT NULL
        AND regexp_replace(phone, '\\D', '', 'g') LIKE ${'%' + tail}
      ORDER BY "updatedAt" DESC
      LIMIT 5
    `;
    if (!rows.length) return null;
    return this.prisma.candidate.findUnique({
      where: { id: rows[0].id },
      select: { id: true, firstName: true, lastName: true, phone: true, extra: true },
    });
  }

  private async findByMaxUser(userId: number) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Candidate"
      WHERE "isDepersonalized" = false
        AND ("extra"->>'maxUserId') IS NOT NULL
        AND ("extra"->>'maxUserId')::bigint = ${BigInt(userId)}
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;
    if (!rows.length) return null;
    return this.prisma.candidate.findUnique({
      where: { id: rows[0].id },
      select: { id: true, firstName: true, lastName: true, phone: true, extra: true },
    });
  }

  private async saveLink(candidateId: string, userId: number, chatId?: number, username?: string) {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.candidate.findUnique({ where: { id: candidateId } });
      if (!c) return;
      const extra: MaxExtra = {
        ...this.extraOf(c),
        maxUserId: userId,
        maxChatId: chatId,
        maxUsername: username,
        maxLinkedAt: new Date().toISOString(),
      };
      await tx.candidate.update({
        where: { id: candidateId },
        data: { extra: extra as Prisma.InputJsonValue },
      });
    });
  }

  /** Атомарно добавляет сообщение; пропускает дубликат по id (mid) */
  private async pushThread(
    candidateId: string,
    entry: { id: string; text: string; fromBot: boolean; at: string },
  ): Promise<{ added: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.candidate.findUnique({ where: { id: candidateId } });
      if (!c) return { added: false };
      const extra = this.extraOf(c);
      const thread = extra.maxThread || [];
      if (thread.some((m) => m.id === entry.id)) return { added: false };
      const nextThread = [...thread, entry].slice(-80);
      const next: MaxExtra = { ...extra, maxThread: nextThread };
      if (!entry.fromBot) {
        next.maxUnread = (extra.maxUnread || 0) + 1;
        next.maxLastInbound = { id: entry.id, text: entry.text, at: entry.at };
      }
      await tx.candidate.update({
        where: { id: candidateId },
        data: { extra: next as Prisma.InputJsonValue },
      });
      return { added: true };
    });
  }

  private nameOf(c: CandidateLite) {
    return [c.lastName, c.firstName, c.middleName].filter(Boolean).join(' ') || 'Кандидат';
  }

  async inbox(user: AuthUser) {
    const list = await this.prisma.candidate.findMany({
      where: { isDepersonalized: false, AND: [this.vis(user)] },
      select: { id: true, firstName: true, lastName: true, middleName: true, extra: true },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    });
    const items: Array<{
      candidateId: string;
      name: string;
      text: string;
      at: string;
      id: string;
      unread: number;
    }> = [];
    let unread = 0;
    for (const c of list) {
      const extra = this.extraOf(c);
      const n = extra.maxUnread || 0;
      if (n <= 0) continue;
      unread += n;
      const last = extra.maxLastInbound;
      if (!last) continue;
      items.push({
        candidateId: c.id,
        name: this.nameOf(c),
        text: last.text,
        at: last.at,
        id: last.id,
        unread: n,
      });
    }
    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return { unread, items: items.slice(0, 30) };
  }

  async dialogs(user: AuthUser) {
    const list = await this.prisma.candidate.findMany({
      where: { isDepersonalized: false, AND: [this.vis(user)] },
      select: { id: true, firstName: true, lastName: true, middleName: true, phone: true, extra: true },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    });
    const items: Array<{
      candidateId: string;
      name: string;
      phone: string | null;
      linked: boolean;
      unread: number;
      invite: string | null;
      lastMessage: { id: string; text: string; fromBot: boolean; at: string } | null;
    }> = [];
    for (const c of list) {
      const extra = this.extraOf(c);
      const thread = extra.maxThread || [];
      if (!extra.maxUserId && !thread.length) continue;
      const last = thread.length
        ? thread[thread.length - 1]
        : extra.maxLastInbound
          ? { id: extra.maxLastInbound.id, text: extra.maxLastInbound.text, fromBot: false, at: extra.maxLastInbound.at }
          : null;
      items.push({
        candidateId: c.id,
        name: this.nameOf(c),
        phone: c.phone || null,
        linked: !!extra.maxUserId,
        unread: extra.maxUnread || 0,
        invite: this.inviteLink(c.id),
        lastMessage: last,
      });
    }
    items.sort((a, b) => {
      const atA = a.lastMessage?.at || '';
      const atB = b.lastMessage?.at || '';
      if (atA === atB) return (b.unread || 0) - (a.unread || 0);
      return atA < atB ? 1 : -1;
    });
    return {
      configured: this.configured(),
      botUsername: this.botUsername() || null,
      items,
    };
  }

  async markRead(candidateId: string, user?: AuthUser) {
    if (user) await this.assertCandidateAccess(candidateId, user);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.candidate.findUnique({ where: { id: candidateId } });
      if (!c) return { ok: false };
      const extra = this.extraOf(c);
      if (!extra.maxUnread) return { ok: true, unread: 0 };
      await tx.candidate.update({
        where: { id: candidateId },
        data: { extra: { ...extra, maxUnread: 0 } as Prisma.InputJsonValue },
      });
      return { ok: true, unread: 0 };
    });
  }

  async markAllRead(user: AuthUser) {
    const list = await this.prisma.candidate.findMany({
      where: { isDepersonalized: false, AND: [this.vis(user)] },
      select: { id: true, extra: true },
      take: 2000,
    });
    for (const c of list) {
      const extra = this.extraOf(c);
      if (!extra.maxUnread) continue;
      await this.prisma.candidate.update({
        where: { id: c.id },
        data: { extra: { ...extra, maxUnread: 0 } as Prisma.InputJsonValue },
      });
    }
    return { ok: true };
  }

  async handleUpdate(update: any, secretHeader?: string) {
    const expected = this.webhookSecret();
    if (expected && secretHeader !== expected) {
      return { ok: false, error: 'invalid_secret' };
    }
    return this.processUpdate(update);
  }

  private async processUpdate(update: any) {
    const type = update?.update_type || update?.updateType;
    const user = update?.user || update?.message?.sender || update?.message?.recipient;
    const userId = Number(user?.user_id || user?.userId || 0) || undefined;
    const chatId = Number(update?.chat_id || update?.message?.recipient?.chat_id || 0) || undefined;

    if (type === 'bot_started') {
      const payload = String(update?.payload || update?.start_payload || '');
      let candidate = await this.findByStartPayload(payload);
      if (!candidate && userId) {
        const linked = await this.findByMaxUser(userId);
        if (linked) candidate = linked;
      }
      if (candidate && userId) {
        await this.saveLink(candidate.id, userId, chatId, user?.username);
        await this.sendText(
          userId,
          'Здравствуйте! Можно писать сюда — сообщение увидит рекрутер, и вы сможете общаться прямо в этом чате.',
        );
        await this.pushThread(candidate.id, {
          id: `sys-start-${candidate.id}-${userId}`,
          text: 'Кандидат начал переписку в MAX',
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
      if (msg?.sender?.is_bot) return { ok: true, ignored: 'own' };
      const text = String(msg?.body?.text || msg?.text || '').trim();
      const attachments = msg?.body?.attachments || msg?.attachments || [];
      const contactPhone =
        attachments.find?.((a: any) => a.type === 'contact')?.payload?.vcf_info ||
        attachments.find?.((a: any) => a.type === 'contact')?.payload?.phone ||
        '';
      const nonTextHint = !text && attachments.length
        ? `[Вложение: ${attachments.map((a: any) => a.type || 'file').join(', ')}]`
        : '';
      const bodyText = text || nonTextHint;
      let candidate = userId ? await this.findByMaxUser(userId) : null;
      if (!candidate && contactPhone) candidate = await this.findByPhone(String(contactPhone));
      if (candidate && userId) {
        await this.saveLink(candidate.id, userId, chatId, user?.username);
        if (bodyText) {
          const mid = String(msg?.body?.mid || msg?.mid || msg?.id || `in-${userId}-${msg?.timestamp || Date.now()}`);
          const pushed = await this.pushThread(candidate.id, {
            id: mid,
            text: bodyText,
            fromBot: false,
            at: this.normalizeAt(msg?.timestamp),
          });
          if (pushed.added) {
            const exists = await this.prisma.comment.findFirst({
              where: { candidateId: candidate.id, body: `[MAX] ${bodyText}` },
              orderBy: { createdAt: 'desc' },
            });
            // не плодим одинаковый комментарий в ту же секунду при ретрае
            if (!exists || Date.now() - new Date(exists.createdAt).getTime() > 60_000) {
              await this.prisma.comment.create({
                data: { candidateId: candidate.id, body: `[MAX] ${bodyText}` },
              });
            }
          }
        }
        return { ok: true, candidateId: candidate.id };
      }
      if (userId) {
        await this.sendText(
          userId,
          'Чтобы рекрутер увидел ваше сообщение, откройте персональную ссылку, которую вам прислали, и нажмите «Начать».',
        );
      }
      this.logger.log(`MAX message from unlinked user ${userId || '?'}`);
      return { ok: true, unmatched: true };
    }

    return { ok: true, ignored: type };
  }

  async chat(candidateId: string, user: AuthUser, opts?: { markRead?: boolean }) {
    const c = await this.assertCandidateAccess(candidateId, user);
    if (opts?.markRead !== false) {
      await this.markRead(candidateId).catch(() => undefined);
    }
    const fresh = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    const extra = this.extraOf(fresh || c);
    const invite = this.inviteLink(candidateId);
    const share = this.shareLink(
      `Здравствуйте, ${c.firstName || ''}! Напишите нам в MAX: ${invite || 'ссылка будет позже'}`,
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

  async send(candidateId: string, text: string, user: AuthUser) {
    if (!this.configured()) return { ok: false, note: 'Бот MAX не настроен' };
    if (!text?.trim()) return { ok: false, note: 'Пустое сообщение' };
    const c = await this.assertCandidateAccess(candidateId, user);
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
    const outId = `out-${user.id}-${Date.now()}`;
    await this.pushThread(candidateId, {
      id: outId,
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
