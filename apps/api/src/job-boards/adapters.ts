import { JobBoard } from '@prisma/client';
import { createHmac, createHash } from 'crypto';

export interface JobBoardPublishInput {
  title: string;
  description: string;
  city?: string;
  externalRef: string;
}

export interface JobBoardPublishResult {
  externalId: string;
  url?: string;
  mocked?: boolean;
  disabled?: boolean;
}

export interface JobBoardSearchInput {
  text?: string;
  area?: string;
  experience?: string;
  page?: number;
}

export interface JobBoardResponseItem {
  externalId: string;
  resumeId?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  email?: string;
  city?: string;
  resumeText?: string;
  desiredPosition?: string;
  currentPosition?: string;
  vacancyExternalId?: string;
  raw?: unknown;
}

export interface JobBoardPort {
  configured(): boolean;
  publish(input: JobBoardPublishInput): Promise<JobBoardPublishResult>;
  search(input: JobBoardSearchInput): Promise<{ items: any[]; total: number; mocked?: boolean; disabled?: boolean }>;
  fetchResponses(vacancyExternalId?: string): Promise<JobBoardResponseItem[]>;
}

/** Honest disabled board — no fake success URL when keys missing */
class DisabledAdapter implements JobBoardPort {
  constructor(private board: string) {}
  configured() { return false; }
  async publish(): Promise<JobBoardPublishResult> {
    throw new Error(`${this.board} не подключён. Обратитесь к администратору.`);
  }
  async search() {
    return { items: [], total: 0, disabled: true };
  }
  async fetchResponses() { return []; }
}

class MockAdapter implements JobBoardPort {
  constructor(private board: string) {}
  configured() { return false; }
  async publish(input: JobBoardPublishInput): Promise<JobBoardPublishResult> {
    const id = `mock-${this.board.toLowerCase()}-${input.externalRef.slice(0, 8)}`;
    return {
      externalId: id,
      url: `https://mock.${this.board.toLowerCase()}.local/vacancy/${id}`,
      mocked: true,
    };
  }
  async search(input: JobBoardSearchInput) {
    return {
      items: [{ id: `${this.board}-cand-1`, name: `Mock ${input.text || 'кандидат'}`, board: this.board, mocked: true }],
      total: 1,
      mocked: true,
    };
  }
  async fetchResponses(): Promise<JobBoardResponseItem[]> { return []; }
}

class HhAdapter implements JobBoardPort {
  configured() {
    return !!(process.env.HH_ACCESS_TOKEN || process.env.HH_CLIENT_ID);
  }

  private async headers() {
    const { resolveHhToken, hhUserAgent } = await import('../integrations/hh-token');
    const token = await resolveHhToken();
    if (!token) throw new Error('HeadHunter не подключён. Откройте Администрирование → Подключить HeadHunter.');
    return {
      Authorization: `Bearer ${token}`,
      'HH-User-Agent': hhUserAgent(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    } as Record<string, string>;
  }

  private async resolveAreaId(city?: string): Promise<string> {
    if (!city?.trim()) return process.env.HH_DEFAULT_AREA_ID || '113'; // Россия
    try {
      const headers = await this.headers();
      const res = await fetch(`https://api.hh.ru/suggests/areas?text=${encodeURIComponent(city.trim())}`, {
        headers: { Authorization: headers.Authorization, 'HH-User-Agent': headers['HH-User-Agent'], Accept: 'application/json' },
      });
      if (res.ok) {
        const data: any = await res.json();
        const id = data?.items?.[0]?.id;
        if (id) return String(id);
      }
    } catch { /* fallback */ }
    return process.env.HH_DEFAULT_AREA_ID || '113';
  }

  async publish(input: JobBoardPublishInput): Promise<JobBoardPublishResult> {
    const headers = await this.headers();
    const areaId = await this.resolveAreaId(input.city);
    const roleId = process.env.HH_DEFAULT_PROFESSIONAL_ROLE_ID || '40'; // другое
    const description = (input.description || input.title || '').trim();
    const htmlDescription = description.includes('<') ? description : `<p>${description.replace(/\n/g, '<br/>')}</p>`;
    const body = {
      name: input.title.slice(0, 100),
      description: htmlDescription,
      area: { id: areaId },
      type: { id: 'open' },
      billing_type: { id: process.env.HH_BILLING_TYPE || 'standard' },
      professional_roles: [{ id: roleId }],
      experience: { id: 'noExperience' },
      employment: { id: 'full' },
      schedule: { id: 'fullDay' },
      accept_handicapped: false,
      accept_kids: false,
      allow_messages: true,
      response_letter_required: false,
      response_notifications: true,
    };
    const res = await fetch('https://api.hh.ru/vacancies', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HH не принял вакансию (${res.status}): ${errText.slice(0, 500)}`);
    }
    const data: any = await res.json();
    return { externalId: String(data.id), url: data.alternate_url };
  }

  async search(input: JobBoardSearchInput) {
    const headers = await this.headers();
    const params = new URLSearchParams();
    if (input.text) params.set('text', input.text);
    if (input.area) params.set('area', input.area);
    params.set('page', String(input.page || 0));
    params.set('per_page', '20');
    const res = await fetch(`https://api.hh.ru/resumes?${params}`, { headers });
    if (!res.ok) throw new Error(`HH search failed: ${res.status}`);
    const data: any = await res.json();
    return { items: data.items || [], total: data.found || 0 };
  }

  /** Import отклики только из папки HH «Неразобранные» (collection `response`). */
  async fetchResponses(vacancyExternalId?: string): Promise<JobBoardResponseItem[]> {
    let headers: Record<string, string>;
    try {
      headers = await this.headers();
    } catch {
      return [];
    }
    if (!vacancyExternalId) return [];

    // Resolve collection url for «Неразобранные» (id: response)
    let collectionPath = `/negotiations/response`;
    try {
      const colRes = await fetch(
        `https://api.hh.ru/negotiations?${new URLSearchParams({ vacancy_id: vacancyExternalId })}`,
        { headers },
      );
      if (colRes.ok) {
        const colData: any = await colRes.json();
        const collections = Array.isArray(colData?.collections)
          ? colData.collections
          : Array.isArray(colData?.items)
            ? colData.items
            : [];
        const responseCol =
          collections.find((c: any) => c?.id === 'response') ||
          collections.find((c: any) => /неразбор/i.test(String(c?.name || '')));
        if (responseCol?.url) {
          try {
            const u = new URL(responseCol.url);
            collectionPath = u.pathname;
          } catch {
            collectionPath = String(responseCol.url).startsWith('/')
              ? String(responseCol.url)
              : `/negotiations/response`;
          }
        } else if (responseCol?.id) {
          collectionPath = `/negotiations/${responseCol.id}`;
        }
      }
    } catch {
      /* fallback to /negotiations/response */
    }

    const out: JobBoardResponseItem[] = [];
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({
        vacancy_id: vacancyExternalId,
        page: String(page),
        per_page: '50',
      });
      const res = await fetch(`https://api.hh.ru${collectionPath}?${params}`, { headers });
      if (!res.ok) break;
      const data: any = await res.json();
      const items = data.items || [];
      for (const item of items) {
        const resume = item.resume || {};
        const mapped = this.mapResume(resume, String(item.id), vacancyExternalId, item);
        out.push(mapped);
      }
      const pages = data.pages ?? 1;
      if (page + 1 >= pages || !items.length) break;
    }
    return out;
  }

  async fetchResume(resumeId: string): Promise<JobBoardResponseItem | null> {
    let headers: Record<string, string>;
    try {
      headers = await this.headers();
    } catch {
      return null;
    }
    if (!resumeId) return null;
    const res = await fetch(`https://api.hh.ru/resumes/${resumeId}`, { headers });
    if (!res.ok) return null;
    const resume: any = await res.json();
    return this.mapResume(resume, resumeId, undefined, resume);
  }

  private mapResume(resume: any, externalId: string, vacancyExternalId?: string, raw?: unknown): JobBoardResponseItem {
    const phone =
      resume.contact?.find?.((c: any) => c.type?.id === 'cell' || c.type?.id === 'home')?.value ||
      resume.phones?.[0]?.formatted ||
      resume.phone ||
      undefined;
    const email =
      resume.contact?.find?.((c: any) => c.type?.id === 'email')?.value ||
      resume.email ||
      undefined;
    const experience = Array.isArray(resume.experience) ? resume.experience : [];
    const expText = experience
      .slice(0, 4)
      .map((e: any) => [e.company, e.position, e.description].filter(Boolean).join(' — '))
      .join('\n');
    const skills = Array.isArray(resume.skill_set) ? resume.skill_set.join(', ') : '';
    const resumeText = [resume.title, resume.skills, skills, expText, resume.education?.level?.name]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 12000);
    return {
      externalId,
      resumeId: resume.id ? String(resume.id) : undefined,
      firstName: resume.first_name || undefined,
      lastName: resume.last_name || undefined,
      middleName: resume.middle_name || undefined,
      phone: typeof phone === 'string' ? phone : phone?.formatted || phone?.number,
      email: typeof email === 'string' ? email : undefined,
      city: resume.area?.name || resume.metro?.city?.name,
      desiredPosition: resume.title,
      currentPosition: experience[0]?.position,
      resumeText: resumeText || undefined,
      vacancyExternalId,
      raw,
    };
  }
}

/** Token-gated boards: live HTTP when token present, else disabled (not fake success) */
class TokenBoardAdapter implements JobBoardPort {
  constructor(
    private board: string,
    private envKey: string,
    private publishUrl: string,
    private searchUrl: string,
  ) {}
  private token() { return process.env[this.envKey]; }
  configured() { return !!this.token(); }

  async publish(input: JobBoardPublishInput): Promise<JobBoardPublishResult> {
    const token = this.token();
    if (!token) throw new Error(`${this.board} не подключён. Обратитесь к администратору.`);
    const res = await fetch(this.publishUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: input.title, description: input.description, city: input.city }),
    });
    if (!res.ok) {
      // Vendor API shape differs — surface error honestly
      throw new Error(`${this.board} publish failed: ${res.status}`);
    }
    const data: any = await res.json().catch(() => ({}));
    return { externalId: String(data.id || data.vacancy_id || Date.now()), url: data.url || data.link };
  }

  async search(input: JobBoardSearchInput) {
    const token = this.token();
    if (!token) return { items: [], total: 0, disabled: true };
    const url = `${this.searchUrl}?q=${encodeURIComponent(input.text || '')}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { items: [], total: 0, disabled: false };
    const data: any = await res.json().catch(() => ({ items: [] }));
    return { items: data.items || data.results || [], total: data.total || data.found || (data.items || []).length };
  }

  async fetchResponses() { return []; }
}

const adapters: Partial<Record<JobBoard, JobBoardPort>> = {
  HH: new HhAdapter(),
  SUPERJOB: new TokenBoardAdapter('SUPERJOB', 'SUPERJOB_TOKEN', 'https://api.superjob.ru/2.0/vacancies/', 'https://api.superjob.ru/2.0/resumes/'),
  AVITO: new TokenBoardAdapter('AVITO', 'AVITO_TOKEN', 'https://api.avito.ru/job/v1/vacancies', 'https://api.avito.ru/job/v1/resumes'),
  ZARPLATA: new TokenBoardAdapter('ZARPLATA', 'ZARPLATA_TOKEN', 'https://api.zarplata.ru/vacancies', 'https://api.zarplata.ru/resumes'),
  RABOTA: new DisabledAdapter('RABOTA'),
  TRUDVSEM: new DisabledAdapter('TRUDVSEM'),
  MANUAL: new MockAdapter('MANUAL'),
};

export function getJobBoardAdapter(board: JobBoard): JobBoardPort {
  return adapters[board] || new DisabledAdapter(board);
}

export function getHhAdapter(): HhAdapter | null {
  const a = adapters.HH;
  return a instanceof HhAdapter ? a : null;
}

export function boardConfigured(board: JobBoard): boolean {
  return getJobBoardAdapter(board).configured();
}

/** AWS SigV4-ish signing helper for MinIO path-style PUT (simplified for local MinIO) */
export function signS3Put(opts: {
  method: string;
  url: string;
  accessKey: string;
  secretKey: string;
  region: string;
  contentType: string;
  bodyHash: string;
  amzDate: string;
}): Record<string, string> {
  // MinIO often accepts unsigned in local; provide Authorization header for real S3-compatible
  const host = new URL(opts.url).host;
  const credential = `${opts.accessKey}/${opts.amzDate.slice(0, 8)}/${opts.region}/s3/aws4_request`;
  const canonical = [
    opts.method,
    new URL(opts.url).pathname,
    '',
    `host:${host}`,
    `x-amz-content-sha256:${opts.bodyHash}`,
    `x-amz-date:${opts.amzDate}`,
    '',
    'host;x-amz-content-sha256;x-amz-date',
    opts.bodyHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    opts.amzDate,
    `${opts.amzDate.slice(0, 8)}/${opts.region}/s3/aws4_request`,
    createHash('sha256').update(canonical).digest('hex'),
  ].join('\n');
  const kDate = createHmac('sha256', 'AWS4' + opts.secretKey).update(opts.amzDate.slice(0, 8)).digest();
  const kRegion = createHmac('sha256', kDate).update(opts.region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    Host: host,
    'Content-Type': opts.contentType,
    'x-amz-content-sha256': opts.bodyHash,
    'x-amz-date': opts.amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
  };
}
