import { createHash } from 'crypto';
import { Body, Controller, Get, Injectable, Logger, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { PrismaService } from '../prisma/prisma.service';

type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type AiProvider = {
  name: 'primary' | 'openrouter' | 'openrouter-auto';
  base: string;
  key: string;
  model: string;
  headers?: Record<string, string>;
};

type ChatResult = { content: string; provider: AiProvider['name'] };

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);

// OpenRouter and some LLM vendors reject requests from certain regions; route through a proxy when set.
const aiProxyUrl = process.env.AI_PROXY_URL || process.env.HTTPS_PROXY || process.env.https_proxy;
const aiDispatcher = aiProxyUrl ? new ProxyAgent(aiProxyUrl) : undefined;

export function aiProviders(): AiProvider[] {
  const list: AiProvider[] = [];
  if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
    list.push({
      name: 'primary',
      base: process.env.AI_BASE_URL.replace(/\/$/, ''),
      key: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4o-mini',
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = {
      base: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
      key: process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': process.env.WEB_URL || 'http://localhost:3000',
        'X-Title': process.env.BRAND_NAME || 'LogHR',
      },
    };
    const model = process.env.OPENROUTER_MODEL || 'openrouter/auto';
    const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL || 'openrouter/auto';
    list.push({ name: 'openrouter', model, ...openrouter });
    if (fallbackModel && fallbackModel !== model) {
      list.push({ name: 'openrouter-auto', model: fallbackModel, ...openrouter });
    }
  }
  return list;
}

function parseJson(raw: string) {
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
}

type InsightInput = {
  city: string | null;
  currentPosition: string | null;
  desiredPosition: string | null;
  salaryExpect: number | null;
  lastJobMonths: number | null;
  willingToRelocate: boolean;
  employmentType: string | null;
  workSchedule: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  pdnConsent: boolean;
  resume: string;
  vacancy: { title: string; city: string | null; description: string | null; profile?: string | null } | null;
};

const SKILLS: { name: string; re: RegExp }[] = [
  { name: 'SQL', re: /\bsql\b|clickhouse|postgres/i },
  { name: 'Python', re: /python|pandas/i },
  { name: 'A/B-тесты', re: /a\/b/i },
  { name: 'Excel', re: /excel/i },
  { name: '1С', re: /1с/i },
  { name: 'BI-дашборды', re: /superset|datalens|power ?bi|tableau/i },
  { name: 'гидропоника/светокультура', re: /гидропон|светокульт/i },
  { name: 'защита растений', re: /защит[аы] растений|сзр/i },
  { name: 'управление командой', re: /команд[аы] \d+|наставни/i },
  { name: 'английский', re: /английск|english/i },
];

const STOP_WORDS = new Set(['и', 'в', 'на', 'по', 'для', 'с', 'к', 'от', 'до', 'the', 'of']);

function words(s?: string | null) {
  return (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/i)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map((w) => w.slice(0, 6));
}

function overlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const set = new Set(b);
  return a.filter((w) => set.has(w)).length / a.length;
}

function months(n: number) {
  if (n < 12) return `${n} мес.`;
  const y = Math.floor(n / 12);
  const m = n % 12;
  return m ? `${y} г. ${m} мес.` : `${y} г.`;
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

export function heuristicInsights(i: InsightInput) {
  let score = 30;
  const strengths: string[] = [];
  const risks: string[] = [];
  const hints: string[] = [];
  const vacancyTitle = i.vacancy?.title?.split('—')[0].trim();
  const target = words(`${i.vacancy?.title || ''} ${i.vacancy?.profile || ''}`);

  const posFit = Math.max(overlap(target, words(i.currentPosition)), overlap(words(i.currentPosition), target));
  const desiredFit = Math.max(overlap(target, words(i.desiredPosition)), overlap(words(i.desiredPosition), target));
  const resumeFit = overlap(target, words(i.resume));
  if (posFit >= 0.5) {
    score += 22;
    strengths.push(`Текущая должность «${i.currentPosition}» совпадает с профилем вакансии`);
  } else if (posFit > 0 || desiredFit >= 0.5) {
    score += posFit > 0 ? 12 : 5;
    strengths.push(`Целится в позицию «${i.desiredPosition || vacancyTitle}»`);
    hints.push(`Опыт «${i.currentPosition || 'не указан'}» лишь частично совпадает с вакансией — попросите привести примеры задач, близких к «${vacancyTitle}»`);
  } else if (i.vacancy) {
    risks.push(`Профиль «${i.currentPosition || 'не указан'}» далёк от вакансии «${vacancyTitle}»`);
    hints.push(`Выясните мотивацию сменить сферу: почему кандидат из «${i.currentPosition || 'другой области'}» хочет в «${vacancyTitle}»`);
  }
  if (resumeFit >= 0.5) score += 6;

  const len = i.resume.length;
  if (len >= 450) {
    score += 12;
    strengths.push('Подробное резюме с описанием обязанностей и результатов');
  } else if (len >= 200) {
    score += 6;
  } else {
    risks.push(len ? 'Очень краткое резюме' : 'Резюме не заполнено');
    hints.push('Резюме скудное — пройдитесь по последним двум местам работы: задачи, масштаб, результаты');
  }
  const achievements = (i.resume.match(/\d+\s?%|\+\d+|\d+\+|\d+\s?(га|человек|тест)/gi) || []).length;
  if (achievements >= 2) {
    score += 6;
    strengths.push('В резюме есть измеримые результаты');
    hints.push('Попросите раскрыть один из цифровых результатов из резюме: что именно сделал сам кандидат и как это измеряли');
  }

  const m = i.lastJobMonths;
  if (m != null) {
    if (m >= 36) {
      score += 10;
      strengths.push(`Стабильность: ${months(m)} на последнем месте`);
      hints.push(`На последнем месте ${months(m)} — узнайте, что сейчас мотивирует к смене работы`);
    } else if (m >= 12) {
      score += 5;
    } else {
      score -= 4;
      risks.push(`Короткий стаж на последнем месте (${months(m)})`);
      hints.push(`Уточните причины ухода после ${months(m)} на последнем месте и что важно в новом работодателе`);
    }
  }

  const vCity = i.vacancy?.city;
  if (vCity && i.city) {
    if (vCity.toLowerCase() === i.city.toLowerCase()) {
      score += 8;
      strengths.push(`Живёт в городе вакансии (${vCity})`);
    } else if (i.willingToRelocate) {
      score += 3;
      hints.push(`Кандидат из г. ${i.city}, готов к переезду в ${vCity} — обсудите сроки переезда и нужна ли компенсация жилья`);
    } else {
      score -= 8;
      risks.push(`Живёт в г. ${i.city}, вакансия в г. ${vCity}, к переезду не готов`);
      hints.push(`Проверьте, рассматривает ли кандидат работу в г. ${vCity} или удалённый формат вообще допустим`);
    }
  }

  if (i.salaryExpect) {
    hints.push(`Ожидания по доходу ${rub(i.salaryExpect)} — сверьте с вилкой вакансии и обсудите структуру (оклад/премия)`);
    if (i.salaryExpect >= 300000 && (posFit < 0.5 || (m ?? 0) < 12)) {
      score -= 6;
      risks.push(`Завышенные ожидания (${rub(i.salaryExpect)}) относительно опыта`);
    }
  }
  if (i.workSchedule && /удал/i.test(i.workSchedule) && vCity) {
    hints.push(`Предпочитает формат «${i.workSchedule}» — заранее проговорите формат работы по вакансии`);
  }
  if (i.workSchedule && /вахт/i.test(i.workSchedule)) strengths.push('Готов(а) к вахтовому методу');

  if (i.hasPhone) score += 3;
  else {
    risks.push('Нет телефона');
    hints.push('Нет телефона — запросите контакт для оперативной связи');
  }
  if (i.hasEmail) score += 2;
  else risks.push('Нет email — не уйдут письма и приглашения');
  if (!i.pdnConsent) risks.push('Нет согласия на обработку ПДн');

  const skills = SKILLS.filter((s) => s.re.test(i.resume)).map((s) => s.name);
  if (skills.length) hints.unshift(`Проверьте на практике заявленные навыки: ${skills.slice(0, 4).join(', ')}`);

  score = Math.max(5, Math.min(95, score));
  for (const h of ['Уточните релевантный опыт за последние 2–3 года', 'Уточните срок выхода и есть ли параллельные предложения']) {
    if (hints.length < 3) hints.push(h);
  }
  const level = score >= 75 ? 'высокое' : score >= 50 ? 'среднее' : 'низкое';
  const rationale = i.vacancy
    ? `Соответствие вакансии «${vacancyTitle}» — ${level}. Учтены должность, резюме, стаж, город и контакты.`
    : `Кандидат не привязан к вакансии — оценка по полноте профиля (${level}).`;
  return { score, rationale, strengths: strengths.slice(0, 5), risks: risks.slice(0, 5), hints: hints.slice(0, 5) };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private prisma: PrismaService) {}

  configured() {
    return aiProviders().length > 0;
  }

  private async chat(messages: AiMessage[]): Promise<ChatResult | null> {
    for (const p of aiProviders()) {
      try {
        const res = await undiciFetch(`${p.base}/chat/completions`, {
          dispatcher: aiDispatcher,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${p.key}`,
            ...(p.headers || {}),
          },
          body: JSON.stringify({ model: p.model, temperature: 0.2, messages }),
          signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        });
        if (!res.ok) {
          throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
        }
        const data = (await res.json()) as any;
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('empty response');
        return { content, provider: p.name };
      } catch (e: any) {
        this.logger.warn(`AI provider "${p.name}" failed: ${e?.message || e}`);
      }
    }
    return null;
  }

  private stubMeta() {
    const configured = this.configured();
    return {
      configured,
      stub: true,
      provider: null,
      note: configured
        ? 'AI-провайдеры недоступны (основной и OpenRouter) — показан эвристический результат.'
        : undefined,
    };
  }

  async parseResume(text: string) {
    const res = await this.chat([
      {
        role: 'system',
        content: 'Extract resume fields as JSON: firstName,lastName,email,phone,city,summary,desiredPosition,currentPosition,citizenship. Reply JSON only.',
      },
      { role: 'user', content: text.slice(0, 12000) },
    ]);
    if (res) {
      try {
        return { configured: true, stub: false, provider: res.provider, data: parseJson(res.content) };
      } catch {
        return { configured: true, stub: false, provider: res.provider, data: { summary: res.content } };
      }
    }
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const email = text.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
    const phone = text.match(/\+?\d[\d\s()-]{8,}\d/)?.[0];
    return {
      ...this.stubMeta(),
      data: {
        firstName: lines[0]?.split(/\s+/)[1] || '',
        lastName: lines[0]?.split(/\s+/)[0] || '',
        email: email || '',
        phone: phone || '',
        summary: lines.slice(1, 4).join(' '),
        desiredPosition: lines.find((l) => /должн|позиц|position/i.test(l)) || '',
      },
    };
  }

  async scoreCandidate(candidateId: string) {
    const { score, rationale, risks, strengths, ...meta } = await this.insights(candidateId, true);
    return { ...meta, score, rationale, risks, strengths };
  }

  async insights(candidateId: string, refresh = false): Promise<Record<string, any>> {
    const c = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { vacancy: { include: { candidateProfile: true } } },
    });
    if (!c) throw new NotFoundException('Кандидат не найден');
    const input = {
      name: `${c.lastName} ${c.firstName}`,
      city: c.city,
      currentPosition: c.currentPosition,
      desiredPosition: c.desiredPosition,
      salaryExpect: c.salaryExpect,
      lastJobMonths: c.lastJobMonths,
      willingToRelocate: c.willingToRelocate,
      employmentType: c.employmentType,
      workSchedule: c.workSchedule,
      hasPhone: !!c.phone,
      hasEmail: !!c.email,
      pdnConsent: !!c.pdnConsentAt,
      resume: (c.resumeText || c.about || '').slice(0, 6000),
      vacancy: c.vacancy ? { title: c.vacancy.title, city: c.vacancy.city, description: c.vacancy.description, profile: c.vacancy.candidateProfile?.name } : null,
    };
    const inputHash = createHash('sha1').update(JSON.stringify(input)).digest('hex');
    const extra = (c.extra && typeof c.extra === 'object' ? c.extra : {}) as Record<string, any>;
    const cached = extra.ai;
    // Heuristic results are retried on the next view so a later-configured provider gets used.
    if (!refresh && cached?.inputHash === inputHash && (!cached.stub || !this.configured())) {
      return { ...cached, cached: true };
    }

    let result = null as Record<string, any> | null;
    const res = await this.chat([
      {
        role: 'system',
        content:
          'Ты помощник рекрутера. Оцени соответствие кандидата вакансии 0-100 и подготовь подсказки для интервью. Отвечай по-русски. ' +
          'Ответ строго JSON: {"score":number,"rationale":string,"strengths":string[],"risks":string[],"hints":string[]} (3-5 подсказок, конкретных для этого кандидата).',
      },
      { role: 'user', content: JSON.stringify(input) },
    ]);
    if (res) {
      try {
        const p = parseJson(res.content);
        result = {
          configured: true,
          stub: false,
          provider: res.provider,
          score: Math.max(0, Math.min(100, Math.round(Number(p.score) || 0))),
          rationale: String(p.rationale || ''),
          strengths: Array.isArray(p.strengths) ? p.strengths.map(String) : [],
          risks: Array.isArray(p.risks) ? p.risks.map(String) : [],
          hints: Array.isArray(p.hints) ? p.hints.map(String) : [],
        };
      } catch {
        result = null;
      }
    }
    if (!result) result = { ...this.stubMeta(), ...heuristicInsights(input) };

    const stored: Record<string, any> = { ...result, inputHash, generatedAt: new Date().toISOString() };
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: { aiScore: stored.score, extra: { ...extra, ai: stored } as any },
    });
    return { ...stored, cached: false };
  }

  async hints(candidateId: string) {
    const { hints, ...meta } = await this.insights(candidateId);
    return { ...meta, hints };
  }
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private service: AiService) {}

  @Post('resume/parse')
  parse(@Body() dto: { text: string }) {
    return this.service.parseResume(dto.text || '');
  }

  @Post('candidates/:id/score')
  score(@Param('id') id: string) {
    return this.service.scoreCandidate(id);
  }

  @Post('candidates/:id/hints')
  hints(@Param('id') id: string) {
    return this.service.hints(id);
  }

  @Get('candidates/:id/insights')
  insights(@Param('id') id: string, @Query('refresh') refresh?: string) {
    return this.service.insights(id, refresh === '1' || refresh === 'true');
  }

  @Post('status')
  status() {
    return {
      configured: this.service.configured(),
      providers: aiProviders().map((p) => ({ name: p.name, model: p.model })),
    };
  }
}

@Module({ controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}
