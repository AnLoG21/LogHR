import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JobBoard, Prisma, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';
import { getJobBoardAdapter } from '../job-boards/adapters';

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

    const title = templateBody.title || vacancy.title;
    const description = templateBody.description || vacancy.description || '';
    const city = templateBody.city || vacancy.city || undefined;

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
        },
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
          error: mocked ? 'MOCKED: нет API-ключа, публикация не отправлена на доску' : undefined,
          payload: {
            title,
            description,
            city,
            profile: vacancy.candidateProfile.name,
            templateId: data.templateId || null,
            template: templateBody,
            mocked,
          },
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
@Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
@Controller('publications')
export class PublicationsController {
  constructor(private service: PublicationsService) {}

  @Get()
  list(@Query('vacancyId') vacancyId?: string) {
    return this.service.list(vacancyId);
  }

  @Get('templates')
  templates(@Query('all') all?: string) {
    return this.service.templates(all === '1' || all === 'true');
  }

  @Post('templates')
  createTemplate(
    @Body() dto: { name: string; board: JobBoard; body?: Record<string, unknown>; isActive?: boolean },
  ) {
    return this.service.createTemplate(dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: { name?: string; board?: JobBoard; body?: Record<string, unknown>; isActive?: boolean },
  ) {
    return this.service.updateTemplate(id, dto);
  }

  @Post()
  publish(@Body() dto: { vacancyId: string; board: JobBoard; accountId?: string; templateId?: string }) {
    return this.service.publish(dto);
  }
}

@Module({ controllers: [PublicationsController], providers: [PublicationsService], exports: [PublicationsService] })
export class PublicationsModule {}
