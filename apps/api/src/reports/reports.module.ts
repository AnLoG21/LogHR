import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async funnelReport() {
    const byStage = await this.prisma.candidate.groupBy({
      by: ['stageId'],
      _count: true,
    });
    const stages = await this.prisma.funnelStage.findMany({ include: { funnel: true } });
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    return {
      name: 'Кандидаты на воронке подбора',
      rows: byStage.map((r) => ({
        stageId: r.stageId,
        stageName: r.stageId ? stageMap.get(r.stageId)?.name : 'Без этапа',
        funnel: r.stageId ? stageMap.get(r.stageId)?.funnel.name : null,
        count: r._count,
      })),
    };
  }

  async sourcesReport() {
    const bySource = await this.prisma.candidate.groupBy({ by: ['source'], _count: true });
    const byAddType = await this.prisma.candidate.groupBy({ by: ['addType'], _count: true });
    return {
      name: 'Эффективность каналов поиска',
      sources: bySource.map((r) => ({ source: r.source, count: r._count })),
      addTypes: byAddType.map((r) => ({ addType: r.addType, count: r._count })),
    };
  }

  async recruiterWorkload() {
    const recruiters = await this.prisma.user.findMany({
      where: { role: { in: ['RECRUITER', 'RECRUITMENT_LEAD'] }, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        _count: {
          select: {
            hiringRequestsRecruited: true,
            assignedTasks: true,
          },
        },
      },
    });
    return { name: 'Занятость рекрутера', rows: recruiters };
  }

  async requestsRegistry() {
    const requests = await this.prisma.hiringRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        orgUnit: { select: { name: true } },
        candidateProfile: { select: { name: true } },
        recruiter: { select: { firstName: true, lastName: true } },
      },
    });
    return { name: 'Реестр заявок', rows: requests };
  }

  async requestCloseTime() {
    const closed = await this.prisma.hiringRequest.findMany({
      where: { status: 'CLOSED' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return {
      name: 'Срок закрытия заявки',
      rows: closed.map((r) => ({
        ...r,
        daysOpen: Math.round((r.updatedAt.getTime() - r.createdAt.getTime()) / 86400000),
      })),
    };
  }

  async candidateProcessingTime() {
    const history = await this.prisma.candidateStatusHistory.findMany({
      orderBy: { createdAt: 'asc' },
      take: 1000,
      include: { stage: true, candidate: { select: { id: true, firstName: true, lastName: true } } },
    });
    return { name: 'Сроки обработки кандидатов', rows: history };
  }

  metabaseInfo() {
    return {
      url: process.env.METABASE_URL || 'http://localhost:3002',
      reports: [
        'Кандидаты на воронке подбора',
        'Эффективность каналов поиска',
        'Занятость рекрутера',
        'Реестр заявок',
        'Срок закрытия заявки',
        'Сроки обработки кандидатов',
      ],
      note: 'Подключите Metabase к PostgreSQL (хост postgres, БД skillaz) и постройте дашборды по этим сущностям.',
    };
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Roles(SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD)
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('funnel') funnel() { return this.service.funnelReport(); }
  @Get('sources') sources() { return this.service.sourcesReport(); }
  @Get('recruiter-workload') workload() { return this.service.recruiterWorkload(); }
  @Get('requests') requests() { return this.service.requestsRegistry(); }
  @Get('close-time') closeTime() { return this.service.requestCloseTime(); }
  @Get('processing-time') processing() { return this.service.candidateProcessingTime(); }
  @Get('metabase') metabase() { return this.service.metabaseInfo(); }
}

@Module({ controllers: [ReportsController], providers: [ReportsService], exports: [ReportsService] })
export class ReportsModule {}
