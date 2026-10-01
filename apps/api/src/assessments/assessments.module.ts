import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuestionnaireType, SystemRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';

const QUESTION_TYPES = ['text', 'textarea', 'number', 'single', 'multi', 'yesno', 'scale'] as const;
const LEGACY_TYPES: Record<string, string> = { boolean: 'yesno' };
type QuestionType = (typeof QUESTION_TYPES)[number];

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
}

function normalizeSchema(schema: any): { questions: Question[] } {
  const raw = Array.isArray(schema?.questions)
    ? schema.questions
    : Array.isArray(schema?.prompts)
      ? schema.prompts.map((text: string) => ({ text, type: 'textarea' }))
      : [];
  const questions: Question[] = raw
    .map((q: any, i: number) => {
      const t = LEGACY_TYPES[q?.type] || q?.type;
      const type: QuestionType = QUESTION_TYPES.includes(t) ? t : 'text';
      const options = Array.isArray(q?.options)
        ? q.options.map((o: any) => String(o).trim()).filter(Boolean)
        : undefined;
      return {
        id: String(q?.id || `q${i + 1}`),
        text: String(q?.text || '').trim(),
        type,
        required: !!q?.required,
        ...(type === 'single' || type === 'multi' ? { options: options || [] } : {}),
      };
    })
    .filter((q: Question) => q.text);
  for (const q of questions) {
    if ((q.type === 'single' || q.type === 'multi') && (q.options?.length || 0) < 2) {
      throw new BadRequestException(`В вопросе «${q.text}» нужно минимум два варианта ответа`);
    }
  }
  if (!questions.length) throw new BadRequestException('Добавьте хотя бы один вопрос');
  return { questions };
}

@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService) {}

  listQuestionnaires() {
    return this.prisma.questionnaire.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { assignments: true, scenarios: true } } },
    });
  }

  async getQuestionnaire(id: string) {
    const q = await this.prisma.questionnaire.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true, scenarios: true } } },
    });
    if (!q || !q.isActive) throw new NotFoundException('Опросник не найден');
    return q;
  }

  createQuestionnaire(data: { name: string; type: QuestionnaireType; schema: any }) {
    const name = String(data.name || '').trim();
    if (!name) throw new BadRequestException('Укажите название опросника');
    return this.prisma.questionnaire.create({
      data: { name, type: data.type || QuestionnaireType.TEST, schema: normalizeSchema(data.schema) as any },
    });
  }

  async updateQuestionnaire(id: string, data: { name?: string; type?: QuestionnaireType; schema?: any }) {
    await this.getQuestionnaire(id);
    const patch: any = {};
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new BadRequestException('Укажите название опросника');
      patch.name = name;
    }
    if (data.type) patch.type = data.type;
    if (data.schema !== undefined) patch.schema = normalizeSchema(data.schema);
    return this.prisma.questionnaire.update({ where: { id }, data: patch });
  }

  async duplicateQuestionnaire(id: string) {
    const q = await this.getQuestionnaire(id);
    return this.prisma.questionnaire.create({
      data: { name: `${q.name} (копия)`, type: q.type, schema: q.schema as any },
    });
  }

  async removeQuestionnaire(id: string) {
    await this.getQuestionnaire(id);
    await this.prisma.assessmentScenario.updateMany({ where: { questionnaireId: id }, data: { isActive: false } });
    return this.prisma.questionnaire.update({ where: { id }, data: { isActive: false } });
  }

  listScenarios() {
    return this.prisma.assessmentScenario.findMany({
      where: { isActive: true },
      include: { questionnaire: true, funnelStage: { include: { funnel: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createScenario(data: { name: string; funnelStageId: string; questionnaireId: string }) {
    return this.prisma.assessmentScenario.create({ data });
  }

  updateScenario(id: string, data: { name?: string; funnelStageId?: string; questionnaireId?: string }) {
    const patch: any = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.funnelStageId) patch.funnelStageId = data.funnelStageId;
    if (data.questionnaireId) patch.questionnaireId = data.questionnaireId;
    return this.prisma.assessmentScenario.update({ where: { id }, data: patch });
  }

  removeScenario(id: string) {
    return this.prisma.assessmentScenario.update({ where: { id }, data: { isActive: false } });
  }

  async assign(candidateId: string, questionnaireId: string) {
    await this.getQuestionnaire(questionnaireId);
    return this.prisma.assessmentAssignment.create({
      data: { candidateId, questionnaireId, externalToken: randomUUID() },
    });
  }

  removeAssignment(id: string) {
    return this.prisma.assessmentAssignment.delete({ where: { id } });
  }

  async getByToken(token: string) {
    const item = await this.prisma.assessmentAssignment.findUnique({
      where: { externalToken: token },
      include: { questionnaire: true, candidate: { select: { firstName: true, lastName: true } } },
    });
    if (!item) throw new NotFoundException();
    return item;
  }

  async submit(token: string, result: any) {
    const item = await this.getByToken(token);
    if (item.status === 'COMPLETED') throw new BadRequestException('Ответы уже отправлены');
    const questions: Question[] = (item.questionnaire.schema as any)?.questions || [];
    const answers = result?.answers || {};
    const missing = questions.filter((q) => {
      if (!q.required) return false;
      const v = answers[q.id];
      return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    });
    if (missing.length) throw new BadRequestException(`Ответьте на обязательный вопрос: «${missing[0].text}»`);
    return this.prisma.assessmentAssignment.update({
      where: { id: item.id },
      data: { result, status: 'COMPLETED', completedAt: new Date() },
    });
  }

  listAssignments(candidateId?: string) {
    return this.prisma.assessmentAssignment.findMany({
      where: candidateId ? { candidateId } : undefined,
      include: { questionnaire: true, candidate: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

const EDITORS = [SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.HR_BP];

@ApiTags('assessments')
@Controller('assessments')
export class AssessmentsController {
  constructor(private service: AssessmentsService) {}

  @ApiBearerAuth()
  @Get('questionnaires')
  questionnaires() { return this.service.listQuestionnaires(); }

  @ApiBearerAuth()
  @Get('questionnaires/:id')
  questionnaire(@Param('id') id: string) { return this.service.getQuestionnaire(id); }

  @ApiBearerAuth()
  @Get('scenarios')
  scenarios() { return this.service.listScenarios(); }

  @ApiBearerAuth()
  @Get('assignments')
  assignments(@Query('candidateId') candidateId?: string) {
    return this.service.listAssignments(candidateId);
  }

  @ApiBearerAuth()
  @Roles(...EDITORS)
  @Post('questionnaires')
  createQ(@Body() dto: { name: string; type: QuestionnaireType; schema: any }) {
    return this.service.createQuestionnaire(dto);
  }

  @ApiBearerAuth()
  @Roles(...EDITORS)
  @Patch('questionnaires/:id')
  updateQ(@Param('id') id: string, @Body() dto: { name?: string; type?: QuestionnaireType; schema?: any }) {
    return this.service.updateQuestionnaire(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...EDITORS)
  @Post('questionnaires/:id/duplicate')
  duplicateQ(@Param('id') id: string) {
    return this.service.duplicateQuestionnaire(id);
  }

  @ApiBearerAuth()
  @Roles(...EDITORS)
  @Delete('questionnaires/:id')
  removeQ(@Param('id') id: string) {
    return this.service.removeQuestionnaire(id);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Post('scenarios')
  createS(@Body() dto: { name: string; funnelStageId: string; questionnaireId: string }) {
    return this.service.createScenario(dto);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Patch('scenarios/:id')
  updateS(@Param('id') id: string, @Body() dto: { name?: string; funnelStageId?: string; questionnaireId?: string }) {
    return this.service.updateScenario(id, dto);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Delete('scenarios/:id')
  removeS(@Param('id') id: string) {
    return this.service.removeScenario(id);
  }

  @ApiBearerAuth()
  @Post('assign')
  assign(@Body() dto: { candidateId: string; questionnaireId: string }) {
    return this.service.assign(dto.candidateId, dto.questionnaireId);
  }

  @ApiBearerAuth()
  @Roles(...EDITORS)
  @Delete('assignments/:id')
  removeAssignment(@Param('id') id: string) {
    return this.service.removeAssignment(id);
  }

  @Public()
  @Get('public/:token')
  publicGet(@Param('token') token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post('public/:token')
  publicSubmit(@Param('token') token: string, @Body() result: any) {
    return this.service.submit(token, result);
  }
}

@Module({ controllers: [AssessmentsController], providers: [AssessmentsService], exports: [AssessmentsService] })
export class AssessmentsModule {}
