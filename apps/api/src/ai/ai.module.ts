import { Body, Controller, Injectable, Logger, Module, Param, Post } from '@nestjs/common';
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

  private async candidatePayload(candidateId: string) {
    const c = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { vacancy: { include: { candidateProfile: true } } },
    });
    if (!c) return null;
    return {
      c,
      payload: {
        name: `${c.lastName} ${c.firstName}`,
        city: c.city,
        resume: (c.resumeText || c.about || '').slice(0, 6000),
        vacancy: c.vacancy?.title,
        profile: c.vacancy?.candidateProfile?.name,
        desired: c.desiredPosition,
      },
    };
  }

  async scoreCandidate(candidateId: string) {
    const found = await this.candidatePayload(candidateId);
    if (!found) return { configured: this.configured(), score: 0, rationale: 'Кандидат не найден', risks: [] as string[] };
    const { c, payload } = found;
    const res = await this.chat([
      {
        role: 'system',
        content: 'Score candidate fit 0-100 for vacancy. Answer in Russian. Reply JSON: {score:number,rationale:string,risks:string[]}',
      },
      { role: 'user', content: JSON.stringify(payload) },
    ]);
    if (res) {
      try {
        return { configured: true, stub: false, provider: res.provider, ...parseJson(res.content) };
      } catch {
        return { configured: true, stub: false, provider: res.provider, score: 50, rationale: res.content, risks: [] };
      }
    }
    const len = (payload.resume || '').length;
    return {
      ...this.stubMeta(),
      score: Math.min(92, 40 + Math.floor(len / 40)),
      rationale: 'Эвристический скоринг по объёму резюме и наличию контактов.',
      risks: c.phone ? [] : ['Нет телефона'],
    };
  }

  async hints(candidateId: string) {
    const found = await this.candidatePayload(candidateId);
    const c = found?.c;
    const res = found
      ? await this.chat([
          { role: 'system', content: 'Give 3-5 short interview hints for a recruiter in Russian. Reply JSON: {hints:string[]}' },
          { role: 'user', content: JSON.stringify(found.payload) },
        ])
      : null;
    if (res) {
      try {
        return { configured: true, stub: false, provider: res.provider, ...parseJson(res.content) };
      } catch {
        return { configured: true, stub: false, provider: res.provider, hints: [res.content] };
      }
    }
    return {
      ...this.stubMeta(),
      hints: [
        'Уточните релевантный опыт за последние 2–3 года',
        'Проверьте готовность к релокации / вахте',
        'Спросите про ожидания по доходу и сроку выхода',
        ...(c?.phone ? [] : ['Нет телефона — запросите контакт']),
      ],
    };
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
