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
    const rows = closed.map((r) => ({
      ...r,
      daysOpen: Math.round((r.updatedAt.getTime() - r.createdAt.getTime()) / 86400000),
    }));
    const avgDays = rows.length
      ? Math.round((rows.reduce((s, r) => s + r.daysOpen, 0) / rows.length) * 10) / 10
      : null;
    return { name: 'Срок закрытия заявки', avgDays, rows };
  }

  async candidateProcessingTime() {
    const history = await this.prisma.candidateStatusHistory.findMany({
      orderBy: { createdAt: 'asc' },
      take: 1000,
      include: { stage: true, candidate: { select: { id: true, firstName: true, lastName: true } } },
    });
    return { name: 'Сроки обработки кандидатов', rows: history };
  }

  async summary() {
    const [
      candidates,
      openRequests,
      closedRequests,
      vacancies,
      offers,
      funnel,
      sources,
      closeTime,
      workload,
    ] = await Promise.all([
      this.prisma.candidate.count({ where: { isDepersonalized: false } }),
      this.prisma.hiringRequest.count({ where: { status: { not: 'CLOSED' } } }),
      this.prisma.hiringRequest.count({ where: { status: 'CLOSED' } }),
      this.prisma.vacancy.count({ where: { isActive: true } }),
      this.prisma.offer.count(),
      this.funnelReport(),
      this.sourcesReport(),
      this.requestCloseTime(),
      this.recruiterWorkload(),
    ]);
    const hiredApprox = (funnel.rows || [])
      .filter((r: any) => /оформ|нанят|hired|offer|оффер/i.test(String(r.stageName || '')))
      .reduce((s: number, r: any) => s + (r.count || 0), 0);
    return {
      name: 'Сводка подбора',
      kpis: {
        candidates,
        openRequests,
        closedRequests,
        activeVacancies: vacancies,
        offers,
        avgCloseDays: closeTime.avgDays,
        conversionPct: candidates ? Math.round((hiredApprox / candidates) * 1000) / 10 : 0,
      },
      funnel: funnel.rows,
      sources: sources.sources,
      workload: workload.rows,
      closeTime: closeTime.rows,
    };
  }

  metabaseInfo() {
    const url = process.env.METABASE_PUBLIC_URL || process.env.METABASE_URL || '';
    const enabled = Boolean(url);
    return {
      url: url || null,
      enabled,
      reports: [
        'Кандидаты на воронке подбора',
        'Эффективность каналов поиска',
        'Занятость рекрутера',
        'Реестр заявок',
        'Срок закрытия заявки (план/факт)',
        'Сроки обработки кандидатов',
      ],
      note: enabled
        ? 'Внешний BI (Metabase). SQL-шаблоны: docs/metabase-dashboards.sql'
        : 'Metabase на этом стенде не запущен (профиль bi, ~1–2 ГБ RAM). Встроенные отчёты выше — основной дашборд. SQL для Metabase: docs/metabase-dashboards.sql',
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
  @Get('summary') summary() { return this.service.summary(); }
  @Get('metabase') metabase() { return this.service.metabaseInfo(); }
}

@Module({ controllers: [ReportsController], providers: [ReportsService], exports: [ReportsService] })
export class ReportsModule {}
