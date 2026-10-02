import {
  Body, Controller, ForbiddenException, Get, Headers, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JobBoard, Prisma, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';
import { getJobBoardAdapter } from '../job-boards/adapters';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/guards';
import { withHhUser } from '../integrations/hh-token';

@Injectable()
export class PublicationsService {
  constructor(private prisma: PrismaService) {}

  list(vacancyId?: string) {
    return this.prisma.publication.findMany({
      where: vacancyId ? { vacancyId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { vacancy: { select: { id: true, title: true } }, account: true },
    });
  }

  templates(all = false) {
    return this.prisma.publicationTemplate.findMany({
      where: all ? undefined : { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  createTemplate(data: { name: string; board: JobBoard; body?: Record<string, unknown>; isActive?: boolean }) {
    return this.prisma.publicationTemplate.create({
      data: {
        name: data.name,
        board: data.board,
        body: (data.body ?? { template: 'default' }) as Prisma.InputJsonValue,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateTemplate(
    id: string,
    data: { name?: string; board?: JobBoard; body?: Record<string, unknown>; isActive?: boolean },
  ) {
    const existing = await this.prisma.publicationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Шаблон не найден');
    return this.prisma.publicationTemplate.update({
      where: { id },
      data: {
        ...(data.name != null ? { name: data.name } : {}),
        ...(data.board != null ? { board: data.board } : {}),
        ...(data.body != null ? { body: data.body as Prisma.InputJsonValue } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      },
    });
  }

  listAutoRules(vacancyId?: string) {
    return this.prisma.autoPublishRule.findMany({
      where: vacancyId ? { vacancyId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { vacancy: { select: { id: true, title: true, city: true } } },
    });
  }

  async createAutoRule(data: {
    vacancyId: string;
    board: JobBoard;
    templateId?: string;
    intervalHours?: number;
    regionHint?: string;
    isActive?: boolean;
  }) {
    const vacancy = await this.prisma.vacancy.findUnique({ where: { id: data.vacancyId } });
    if (!vacancy) throw new NotFoundException('Вакансия не найдена');
    const hours = Math.max(1, data.intervalHours ?? 24);
    return this.prisma.autoPublishRule.create({
      data: {
        vacancyId: data.vacancyId,
        board: data.board,
        templateId: data.templateId,
        intervalHours: hours,
        regionHint: data.regionHint || vacancy.city || undefined,
        isActive: data.isActive ?? true,
        nextRunAt: new Date(),
      },
    });
  }

  async updateAutoRule(
    id: string,
    data: Partial<{ board: JobBoard; templateId: string | null; intervalHours: number; regionHint: string; isActive: boolean }>,
  ) {
    const existing = await this.prisma.autoPublishRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Правило не найдено');
    return this.prisma.autoPublishRule.update({
      where: { id },
      data: {
        ...(data.board != null ? { board: data.board } : {}),
        ...(data.templateId !== undefined ? { templateId: data.templateId } : {}),
        ...(data.intervalHours != null ? { intervalHours: Math.max(1, data.intervalHours) } : {}),
        ...(data.regionHint != null ? { regionHint: data.regionHint } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      },
    });
  }

  async runDueAutoPublishes(limit = 20) {
    const now = new Date();
    const due = await this.prisma.autoPublishRule.findMany({
      where: {
        isActive: true,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
      take: limit,
      orderBy: { nextRunAt: 'asc' },
    });
    const results: Array<{ ruleId: string; ok: boolean; publicationId?: string; error?: string }> = [];
    for (const rule of due) {
      try {
        const pub = await this.publish({
          vacancyId: rule.vacancyId,
          board: rule.board,
          templateId: rule.templateId || undefined,
        });
        const next = new Date(Date.now() + rule.intervalHours * 3600_000);
        await this.prisma.autoPublishRule.update({
          where: { id: rule.id },
          data: { lastRunAt: now, nextRunAt: next, lastError: pub.status === 'FAILED' ? pub.error : null },
        });
        results.push({ ruleId: rule.id, ok: pub.status !== 'FAILED', publicationId: pub.id, error: pub.error || undefined });
      } catch (e: any) {
        await this.prisma.autoPublishRule.update({
          where: { id: rule.id },
          data: {
            lastRunAt: now,
            nextRunAt: new Date(Date.now() + rule.intervalHours * 3600_000),
            lastError: e?.message || 'auto-publish failed',
          },
        });
        results.push({ ruleId: rule.id, ok: false, error: e?.message });
      }
    }
    return { ran: results.length, results };
  }

  async publish(data: {
    vacancyId: string;
    board: JobBoard;
    accountId?: string;
    templateId?: string;
  }) {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id: data.vacancyId },
      include: { candidateProfile: true, orgUnit: true },
    });
    if (!vacancy) throw new NotFoundException('Вакансия не найдена');

    let templateBody: Record<string, any> = {};
    if (data.templateId) {
      const tpl = await this.prisma.publicationTemplate.findUnique({ where: { id: data.templateId } });
      if (!tpl) throw new NotFoundException('Шаблон не найден');
      if (tpl.body && typeof tpl.body === 'object') templateBody = tpl.body as Record<string, any>;
    }

    const vars: Record<string, string> = {
      vacancy: vacancy.title,
      city: vacancy.city || '',
      company: process.env.COMPANY_NAME || 'ТАЙМЫР ИНВЕСТ',
      description: vacancy.description || '',
      orgUnit: vacancy.orgUnit?.name || '',
    };
    const fill = (s?: string) =>
      s ? s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '') : s;
    const title = fill(templateBody.title) || vacancy.title;
    const description = fill(templateBody.description) || vacancy.description || '';
    const city = fill(templateBody.city) || vacancy.city || undefined;

    const adapter = getJobBoardAdapter(data.board);
    const publication = await this.prisma.publication.create({
      data: {
        vacancyId: data.vacancyId,
        board: data.board,
        accountId: data.accountId,
        status: 'DRAFT',
        payload: {
          title,
          description,
          city,
          profile: vacancy.candidateProfile.name,
          templateId: data.templateId || null,
          template: templateBody,
        } as Prisma.InputJsonValue,
      },
    });

    try {
      const result = await adapter.publish({
        title,
        description,
        city,
        externalRef: publication.id,
      });
      const mocked = !!(result as any).mocked;
      return this.prisma.publication.update({
        where: { id: publication.id },
        data: {
          status: mocked ? 'DRAFT' : 'PUBLISHED',
          externalId: result.externalId,
          url: result.url,
          publishedAt: mocked ? undefined : new Date(),
          error: mocked ? 'Демо-режим: объявление не отправлено на площадку' : undefined,
          payload: {
            title,
            description,
            city,
            profile: vacancy.candidateProfile.name,
            templateId: data.templateId || null,
            template: templateBody,
            mocked,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (e: any) {
      return this.prisma.publication.update({
        where: { id: publication.id },
        data: { status: 'FAILED', error: e?.message || 'Publish failed' },
      });
    }
  }
}

@ApiTags('publications')
@ApiBearerAuth()
@Controller('publications')
export class PublicationsController {
  constructor(private service: PublicationsService) {}

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Get()
  list(@Query('vacancyId') vacancyId?: string) {
    return this.service.list(vacancyId);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Get('templates')
  templates(@Query('all') all?: string) {
    return this.service.templates(all === '1' || all === 'true');
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Post('templates')
  createTemplate(
    @Body() dto: { name: string; board: JobBoard; body?: Record<string, unknown>; isActive?: boolean },
  ) {
    return this.service.createTemplate(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: { name?: string; board?: JobBoard; body?: Record<string, unknown>; isActive?: boolean },
  ) {
    return this.service.updateTemplate(id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Get('auto-rules')
  listAutoRules(@Query('vacancyId') vacancyId?: string) {
    return this.service.listAutoRules(vacancyId);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Post('auto-rules')
  createAutoRule(
    @Body()
    dto: {
      vacancyId: string;
      board: JobBoard;
      templateId?: string;
      intervalHours?: number;
      regionHint?: string;
      isActive?: boolean;
    },
  ) {
    return this.service.createAutoRule(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Patch('auto-rules/:id')
  updateAutoRule(
    @Param('id') id: string,
    @Body()
    dto: Partial<{ board: JobBoard; templateId: string | null; intervalHours: number; regionHint: string; isActive: boolean }>,
  ) {
    return this.service.updateAutoRule(id, dto);
  }

  @Public()
  @Post('auto-run')
  autoRun(@Headers('x-worker-token') workerToken?: string) {
    const expected = process.env.WORKER_TOKEN;
    if (expected && workerToken !== expected) {
      throw new ForbiddenException('Invalid worker token');
    }
    return this.service.runDueAutoPublishes();
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Post('auto-run/now')
  autoRunNow() {
    return this.service.runDueAutoPublishes();
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Post()
  publish(
    @Body() dto: { vacancyId: string; board: JobBoard; accountId?: string; templateId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return withHhUser(user?.id, () => this.service.publish(dto));
  }
}

@Module({ controllers: [PublicationsController], providers: [PublicationsService], exports: [PublicationsService] })
export class PublicationsModule {}
