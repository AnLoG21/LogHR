import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/guards';
import { visibilityWhere } from '../common/visibility';
import { StorageService } from '../storage/storage.module';
import { NotificationsService } from '../notifications/notifications.module';

const API = 'https://platform-api2.max.ru';

type MaxAttachmentMeta = {
  type: 'image' | 'video' | 'audio' | 'file';
  name?: string;
  mime?: string;
  url?: string;
  size?: number;
};

type MaxThreadMsg = {
  id: string;
  text: string;
  fromBot: boolean;
  at: string;
  attachment?: MaxAttachmentMeta;
};

type MaxExtra = {
  maxUserId?: number;
  maxChatId?: number;
  maxUsername?: string;
  maxLinkedAt?: string;
  maxUnread?: number;
  maxLastInbound?: { id: string; text: string; at: string };
  maxThread?: MaxThreadMsg[];
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

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (!this.configured()) return;
    void this.migrateThreadsFromExtra().catch((e) =>
      this.logger.warn(`MAX thread migrate: ${e?.message || e}`),
    );
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

  /** Атомарно добавляет сообщение; пропускает дубликат по externalId */
  private async pushThread(
    candidateId: string,
    entry: MaxThreadMsg,
  ): Promise<{ added: boolean }> {
    try {
      await this.prisma.maxMessage.create({
        data: {
          candidateId,
          externalId: entry.id,
          text: entry.text,
          fromBot: entry.fromBot,
          attachment: entry.attachment ? (entry.attachment as any) : undefined,
          createdAt: entry.at ? new Date(entry.at) : undefined,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return { added: false };
      throw e;
    }

    // совместимость: счётчик unread + last inbound в extra
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.candidate.findUnique({ where: { id: candidateId } });
      if (!c) return;
      const extra = this.extraOf(c);
      const next: MaxExtra = { ...extra };
      if (!entry.fromBot) {
        next.maxUnread = (extra.maxUnread || 0) + 1;
        next.maxLastInbound = { id: entry.id, text: entry.text, at: entry.at };
      }
      // больше не пишем maxThread в JSON
      if (next.maxThread) delete next.maxThread;
      await tx.candidate.update({
        where: { id: candidateId },
        data: { extra: next as Prisma.InputJsonValue },
      });
    });
    return { added: true };
  }

  /** Одноразовая миграция старых тредов из Candidate.extra.maxThread */
  private async migrateThreadsFromExtra() {
    const rows = await this.prisma.candidate.findMany({
      where: { isDepersonalized: false },
      select: { id: true, extra: true },
      take: 5000,
    });
    let migrated = 0;
    for (const c of rows) {
      const extra = this.extraOf(c);
      const thread = extra.maxThread || [];
      if (!thread.length) continue;
      for (const m of thread) {
        if (!m?.id) continue;
        try {
          await this.prisma.maxMessage.create({
            data: {
              candidateId: c.id,
              externalId: String(m.id),
              text: String(m.text || ''),
              fromBot: !!m.fromBot,
              attachment: (m as any).attachment || undefined,
              createdAt: m.at ? new Date(m.at) : undefined,
            },
          });
          migrated += 1;
        } catch {
          /* duplicate */
        }
      }
      const { maxThread: _drop, ...rest } = extra;
      await this.prisma.candidate.update({
        where: { id: c.id },
        data: { extra: rest as Prisma.InputJsonValue },
      });
    }
    if (migrated) this.logger.log(`MAX migrated ${migrated} messages from Candidate.extra`);
  }

  private mimeToUploadType(mime?: string, fileName?: string): MaxAttachmentMeta['type'] {
    const m = (mime || '').toLowerCase();
    const n = (fileName || '').toLowerCase();
    if (m.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|tiff?)$/.test(n)) return 'image';
    if (m.startsWith('video/') || /\.(mp4|mov|mkv|webm)$/.test(n)) return 'video';
    if (m.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac)$/.test(n)) return 'audio';
    return 'file';
  }

  private labelOfType(type: string) {
    const t = String(type || '').toLowerCase();
    if (t === 'image') return 'Фото';
    if (t === 'video') return 'Видео';
    if (t === 'audio') return 'Аудио';
    if (t === 'file') return 'Файл';
    if (t === 'sticker') return 'Стикер';
    if (t === 'contact') return 'Контакт';
    if (t === 'location') return 'Геолокация';
    if (t === 'share') return 'Ссылка';
    return 'Вложение';
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Двухшаговая загрузка в MAX → token для attachments */
  private async uploadToMax(
    type: MaxAttachmentMeta['type'],
    buffer: Buffer,
    fileName: string,
    mimeType?: string,
  ): Promise<{ token: string } | { ok: false; note: string; status?: number }> {
    const init = await fetch(`${API}/uploads?type=${encodeURIComponent(type)}`, {
      method: 'POST',
      headers: this.headers(),
    });
    const initText = await init.text().catch(() => '');
    if (!init.ok) {
      return { ok: false, status: init.status, note: initText.slice(0, 300) || 'Не удалось получить URL загрузки MAX' };
    }
    let endpoint: any = {};
    try {
      endpoint = JSON.parse(initText);
    } catch {
      return { ok: false, note: 'Некорректный ответ MAX /uploads' };
    }
    const uploadUrl = String(endpoint.url || '');
    if (!uploadUrl) return { ok: false, note: 'MAX не вернул URL для загрузки файла' };

    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType || 'application/octet-stream' });
    form.append('data', blob, fileName || 'file');
    const up = await fetch(uploadUrl, { method: 'POST', body: form });
    const upText = await up.text().catch(() => '');
    if (!up.ok) {
      return { ok: false, status: up.status, note: upText.slice(0, 300) || 'Ошибка загрузки файла в MAX' };
    }
    let uploaded: any = {};
    try {
      uploaded = upText ? JSON.parse(upText) : {};
    } catch {
      uploaded = {};
    }
    const token =
      String(uploaded.token || uploaded.payload?.token || endpoint.token || '').trim() ||
      (type === 'video' || type === 'audio' ? String(endpoint.token || '').trim() : '');
    if (!token) {
      return { ok: false, note: 'MAX не вернул token вложения после загрузки' };
    }
    return { token };
  }

  private async sendWithAttachments(
    userId: number,
    text: string | undefined,
    attachments: Array<{ type: string; payload: { token: string } }>,
  ) {
    const body: any = { attachments };
    if (text?.trim()) body.text = text.trim();
    let lastNote = '';
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await this.sleep(800 * attempt);
      const res = await fetch(`${API}/messages?user_id=${userId}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true as const };
      const err = await res.text().catch(() => '');
      lastStatus = res.status;
      lastNote = err.slice(0, 300) || res.statusText;
      if (!/attachment\.not\.ready|not ready|processing/i.test(err) && res.status !== 429) break;
    }
    return { ok: false as const, status: lastStatus, note: lastNote };
  }

  private async persistInboundAttachment(
    att: any,
  ): Promise<{ meta?: MaxAttachmentMeta; label: string }> {
    const typeRaw = String(att?.type || 'file').toLowerCase();
    const type: MaxAttachmentMeta['type'] =
      typeRaw === 'image' || typeRaw === 'video' || typeRaw === 'audio' || typeRaw === 'file'
        ? typeRaw
        : 'file';
    const payload = att?.payload || {};
    const name = String(payload.filename || payload.file_name || payload.name || type).slice(0, 180);
    const remoteUrl = String(payload.url || payload.photoUrl || payload.fileUrl || '').trim();
    const labelMap: Record<string, string> = {
      image: 'Фото',
      video: 'Видео',
      audio: 'Аудио',
      file: 'Файл',
      sticker: 'Стикер',
      contact: 'Контакт',
      location: 'Геолокация',
      share: 'Ссылка',
    };
    const label = labelMap[typeRaw] || typeRaw;

    if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) {
      return { label, meta: { type, name } };
    }

    try {
      const res = await fetch(remoteUrl, { headers: this.headers() });
      if (!res.ok) {
        return { label, meta: { type, name, url: remoteUrl } };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') || undefined;
      const uploaded = await this.storage.upload(buf, name || `max-${type}`, mime);
      return {
        label,
        meta: { type, name, mime, url: uploaded.url, size: buf.length },
      };
    } catch {
      return { label, meta: { type, name, url: remoteUrl } };
    }
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
    const ids = list.map((c) => c.id);
    const lastByCand = new Map<string, { id: string; text: string; fromBot: boolean; at: string }>();
    if (ids.length) {
      const lasts = await this.prisma.maxMessage.findMany({
        where: { candidateId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        distinct: ['candidateId'],
      });
      for (const row of lasts) {
        lastByCand.set(row.candidateId, {
          id: row.externalId,
          text: row.text,
          fromBot: row.fromBot,
          at: row.createdAt.toISOString(),
        });
      }
    }
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
      const last = lastByCand.get(c.id) || null;
      if (!extra.maxUserId && !last) continue;
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
    await this.prisma.maxMessage.updateMany({
      where: { candidateId, fromBot: false, readAt: null },
      data: { readAt: new Date() },
    });
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
      await this.prisma.maxMessage.updateMany({
        where: { candidateId: c.id, fromBot: false, readAt: null },
        data: { readAt: new Date() },
      });
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
      const mediaAtts = (Array.isArray(attachments) ? attachments : []).filter(
        (a: any) => a && !['inline_keyboard'].includes(String(a.type || '')),
      );
      const contactPhone =
        mediaAtts.find?.((a: any) => a.type === 'contact')?.payload?.vcf_info ||
        mediaAtts.find?.((a: any) => a.type === 'contact')?.payload?.phone ||
        '';
      let savedAtt: MaxAttachmentMeta | undefined;
      let attLabel = '';
      const firstMedia = mediaAtts.find((a: any) =>
        ['image', 'video', 'audio', 'file', 'sticker'].includes(String(a.type || '')),
      );
      if (firstMedia) {
        const persisted = await this.persistInboundAttachment(firstMedia);
        savedAtt = persisted.meta;
        attLabel = persisted.label;
      }
      const labels = mediaAtts.map((a: any) => this.labelOfType(a.type || 'file')).join(', ');
      const nonTextHint =
        !text && mediaAtts.length
          ? `[${labels}${savedAtt?.name && savedAtt.name !== attLabel ? `: ${savedAtt.name}` : ''}]`
          : '';
      const bodyText = text || nonTextHint || (savedAtt ? `[${attLabel || this.labelOfType(savedAtt.type)}]` : '');
      let candidate = userId ? await this.findByMaxUser(userId) : null;
      if (!candidate && contactPhone) candidate = await this.findByPhone(String(contactPhone));
      if (candidate && userId) {
        await this.saveLink(candidate.id, userId, chatId, user?.username);
        if (bodyText || savedAtt) {
          const mid = String(msg?.body?.mid || msg?.mid || msg?.id || `in-${userId}-${msg?.timestamp || Date.now()}`);
          const pushed = await this.pushThread(candidate.id, {
            id: mid,
            text: bodyText || `[${attLabel || this.labelOfType(savedAtt?.type || 'file')}]`,
            fromBot: false,
            at: this.normalizeAt(msg?.timestamp),
            ...(savedAtt ? { attachment: savedAtt } : {}),
          });
          if (pushed.added) {
            const commentBody = `[MAX] ${bodyText || savedAtt?.name || 'вложение'}`;
            const exists = await this.prisma.comment.findFirst({
              where: { candidateId: candidate.id, body: commentBody },
              orderBy: { createdAt: 'desc' },
            });
            if (!exists || Date.now() - new Date(exists.createdAt).getTime() > 60_000) {
              await this.prisma.comment.create({
                data: { candidateId: candidate.id, body: commentBody },
              });
            }
            void this.notifyStaffInbound(candidate.id, bodyText || savedAtt?.name || 'вложение').catch(() => undefined);
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
    const rows = await this.prisma.maxMessage.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const messages = rows.map((m) => ({
      id: m.externalId,
      text: m.text,
      fromBot: m.fromBot,
      at: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() || null,
      attachment: m.attachment || undefined,
    }));
    return {
      configured: true,
      linked,
      maxUserId: extra.maxUserId || null,
      invite,
      share,
      botUsername: this.botUsername(),
      messages,
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

  async sendFile(
    candidateId: string,
    file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number },
    user: AuthUser,
    caption?: string,
  ) {
    if (!this.configured()) return { ok: false, note: 'Бот MAX не настроен' };
    if (!file?.buffer?.length) return { ok: false, note: 'Выберите файл' };
    const max = Number(process.env.UPLOAD_MAX_BYTES || 20 * 1024 * 1024);
    if ((file.size || file.buffer.length) > max) {
      return { ok: false, note: `Файл больше ${Math.round(max / 1024 / 1024)} МБ` };
    }
    const c = await this.assertCandidateAccess(candidateId, user);
    const extra = this.extraOf(c);
    if (!extra.maxUserId) {
      return {
        ok: false,
        note: 'Сначала дождитесь, пока кандидат откроет ссылку-приглашение',
        invite: this.inviteLink(candidateId),
      };
    }
    const fileName = file.originalname || 'file';
    const mime = file.mimetype || 'application/octet-stream';
    const type = this.mimeToUploadType(mime, fileName);
    const uploaded = await this.uploadToMax(type, file.buffer, fileName, mime);
    if ('ok' in uploaded && uploaded.ok === false) return uploaded;

    const sent = await this.sendWithAttachments(
      extra.maxUserId,
      caption,
      [{ type, payload: { token: (uploaded as { token: string }).token } }],
    );
    if (!sent.ok) return sent;

    let localUrl: string | undefined;
    try {
      const stored = await this.storage.upload(file.buffer, fileName, mime);
      localUrl = stored.url;
      await this.prisma.attachment.create({
        data: {
          candidateId,
          fileName,
          mimeType: mime,
          url: stored.url,
          size: file.size || file.buffer.length,
        },
      });
    } catch (e: any) {
      this.logger.warn(`MAX local store failed: ${e?.message || e}`);
    }

    const label = type === 'image' ? 'Фото' : type === 'video' ? 'Видео' : type === 'audio' ? 'Аудио' : 'Файл';
    const text = caption?.trim() || `${label}: ${fileName}`;
    await this.pushThread(candidateId, {
      id: `out-file-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      fromBot: true,
      at: new Date().toISOString(),
      attachment: { type, name: fileName, mime, url: localUrl, size: file.size || file.buffer.length },
    });
    await this.prisma.notificationLog.create({
      data: {
        channel: 'MAX',
        to: String(extra.maxUserId),
        subject: candidateId,
        body: text,
        status: 'SENT',
      },
    });
    return { ok: true };
  }

  private async notifyStaffInbound(candidateId: string, text: string) {
    const c = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignee: { select: { email: true } },
        hiringRequest: {
          select: {
            recruiter: { select: { email: true } },
            hiringManager: { select: { email: true } },
          },
        },
      },
    });
    if (!c) return;

    const emails = new Set<string>();
    const addEmail = (raw?: string | null) => {
      const v = String(raw || '').trim().toLowerCase();
      if (v && v.includes('@')) emails.add(v);
    };
    addEmail(c.assignee?.email);
    addEmail(c.hiringRequest?.recruiter?.email);
    addEmail(c.hiringRequest?.hiringManager?.email);
    if (!emails.size) {
      const admins = await this.prisma.user.findMany({
        where: { isActive: true, role: { in: ['ADMIN', 'RECRUITMENT_LEAD'] } },
        select: { email: true },
        take: 5,
      });
      for (const a of admins) addEmail(a.email);
    }
    if (!emails.size) return;

    const name = [c.lastName, c.firstName].filter(Boolean).join(' ');
    const base = (process.env.PUBLIC_URL || process.env.WEB_URL || '').replace(/\/$/, '');
    const link = `${base}/messengers?chat=${c.id}`;
    const marker = `chat=${c.id}`;
    const cooldownMs = Number(process.env.MAX_INBOUND_EMAIL_COOLDOWN_MS || 5 * 60 * 1000);
    const since = new Date(Date.now() - cooldownMs);
    const recent = await this.prisma.notificationLog.findMany({
      where: {
        channel: 'EMAIL',
        to: { in: [...emails] },
        createdAt: { gte: since },
        status: { in: ['SENT', 'MOCKED'] },
        body: { contains: marker },
      },
      select: { to: true },
    });
    const already = new Set(recent.map((r) => r.to.trim().toLowerCase()));

    for (const to of emails) {
      if (already.has(to)) continue;
      await this.notifications.sendEmail(to, 'MAX_INBOUND_STAFF', {
        name,
        text: text.slice(0, 500),
        link,
      });
    }
  }

  async listQuickReplies() {
    return this.prisma.chatQuickReply.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listQuickRepliesAdmin() {
    return this.prisma.chatQuickReply.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createQuickReply(data: { text: string; sortOrder?: number; isActive?: boolean }) {
    const text = String(data.text || '').trim();
    if (!text) throw new BadRequestException('Введите текст ответа');
    if (text.length > 1000) throw new BadRequestException('Слишком длинный текст');
    const maxOrder = await this.prisma.chatQuickReply.aggregate({ _max: { sortOrder: true } });
    return this.prisma.chatQuickReply.create({
      data: {
        text,
        sortOrder: data.sortOrder ?? ((maxOrder._max.sortOrder ?? -1) + 1),
        isActive: data.isActive !== false,
      },
    });
  }

  async updateQuickReply(
    id: string,
    data: { text?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const row = await this.prisma.chatQuickReply.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    const patch: any = {};
    if (data.text !== undefined) {
      const text = String(data.text).trim();
      if (!text) throw new BadRequestException('Введите текст ответа');
      if (text.length > 1000) throw new BadRequestException('Слишком длинный текст');
      patch.text = text;
    }
    if (data.sortOrder !== undefined) patch.sortOrder = Number(data.sortOrder) || 0;
    if (data.isActive !== undefined) patch.isActive = !!data.isActive;
    return this.prisma.chatQuickReply.update({ where: { id }, data: patch });
  }

  async removeQuickReply(id: string) {
    const row = await this.prisma.chatQuickReply.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    await this.prisma.chatQuickReply.delete({ where: { id } });
    return { ok: true };
  }

  async sendFiles(
    candidateId: string,
    files: Array<{ buffer: Buffer; originalname?: string; mimetype?: string; size?: number }>,
    user: AuthUser,
    caption?: string,
  ) {
    if (!files?.length) return { ok: false, note: 'Выберите файлы' };
    const results: Array<{ name?: string; ok: boolean; note?: string }> = [];
    let first = true;
    for (const file of files.slice(0, 5)) {
      const res = await this.sendFile(candidateId, file, user, first ? caption : undefined);
      results.push({ name: file.originalname, ok: !!res.ok, note: (res as any).note });
      first = false;
      if (!res.ok && results.length === 1) return res;
    }
    const failed = results.filter((r) => !r.ok);
    return { ok: failed.length === 0, results, note: failed[0]?.note };
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
