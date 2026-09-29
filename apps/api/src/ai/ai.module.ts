import { Body, Controller, Injectable, Module, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService) {}

  configured() {
    return !!(process.env.AI_API_KEY && process.env.AI_BASE_URL);
  }

  private async chat(messages: AiMessage[]): Promise<string> {
    if (!this.configured()) {
      return '';
    }
    const base = (process.env.AI_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI error: ${res.status} ${text}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async parseResume(text: string) {
    if (!this.configured()) {
      const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const email = text.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
      const phone = text.match(/\+?\d[\d\s()-]{8,}\d/)?.[0];
      return {
        configured: false,
        stub: true,
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
    const raw = await this.chat([
      {
        role: 'system',
        content: 'Extract resume fields as JSON: firstName,lastName,email,phone,city,summary,desiredPosition,currentPosition,citizenship. Reply JSON only.',
      },
      { role: 'user', content: text.slice(0, 12000) },
    ]);
    try {
      const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
      return { configured: true, stub: false, data };
    } catch {
      return { configured: true, stub: false, data: { summary: raw } };
    }
  }

  async scoreCandidate(candidateId: string) {
    const c = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { vacancy: { include: { candidateProfile: true } } },
    });
    if (!c) return { configured: this.configured(), score: 0, rationale: 'Кандидат не найден' };
    const payload = {
      name: `${c.lastName} ${c.firstName}`,
      resume: c.resumeText || c.about || '',
      vacancy: c.vacancy?.title,
      profile: c.vacancy?.candidateProfile?.name,
      desired: c.desiredPosition,
    };
    if (!this.configured()) {
      const len = (payload.resume || '').length;
      const score = Math.min(92, 40 + Math.floor(len / 40));
      return {
        configured: false,
        stub: true,
        score,
        rationale: 'AI не настроен — эвристический скоринг по объёму резюме и наличию контактов.',
        risks: c.phone ? [] : ['Нет телефона'],
      };
    }
    const raw = await this.chat([
      {
        role: 'system',
        content: 'Score candidate fit 0-100 for vacancy. Reply JSON: {score:number,rationale:string,risks:string[]}',
      },
      { role: 'user', content: JSON.stringify(payload) },
    ]);
    try {
      return { configured: true, stub: false, ...JSON.parse(raw.replace(/```json|```/g, '').trim()) };
    } catch {
      return { configured: true, stub: false, score: 50, rationale: raw, risks: [] };
    }
  }

  async hints(candidateId: string) {
    const scored = await this.scoreCandidate(candidateId);
    if (!this.configured()) {
      return {
        configured: false,
        stub: true,
        hints: [
          'Уточните релевантный опыт за последние 2–3 года',
          'Проверьте готовность к релокации / вахте',
          'Спросите про ожидания по доходу и сроку выхода',
          ...(scored.risks || []),
        ],
      };
    }
    const c = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    const raw = await this.chat([
      { role: 'system', content: 'Give 3-5 short interview hints for a recruiter in Russian. Reply JSON: {hints:string[]}' },
      { role: 'user', content: JSON.stringify({ candidate: c, score: scored }) },
    ]);
    try {
      return { configured: true, stub: false, ...JSON.parse(raw.replace(/```json|```/g, '').trim()) };
    } catch {
      return { configured: true, stub: false, hints: [raw] };
    }
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
    return { configured: this.service.configured() };
  }
}

@Module({ controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}
