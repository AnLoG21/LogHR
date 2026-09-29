import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/guards';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(user: AuthUser) {
    const [
      candidates,
      vacancies,
      openRequests,
      myTasks,
      offers,
      checks,
    ] = await Promise.all([
      this.prisma.candidate.count({ where: { isDepersonalized: false } }),
      this.prisma.vacancy.count({ where: { isActive: true } }),
      this.prisma.hiringRequest.count({
        where: { status: { in: ['NEW', 'PENDING_HR_BP', 'APPROVED_HR_BP', 'IN_PROGRESS'] } },
      }),
      this.prisma.task.count({ where: { assigneeId: user.id, status: 'OPEN' } }),
      this.prisma.offer.count({ where: { status: { in: ['DRAFT', 'PENDING_MANAGER', 'SENT_TO_CANDIDATE'] } } }),
      this.prisma.check.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } }),
    ]);

    const recentCandidates = await this.prisma.candidate.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { stage: true, vacancy: { select: { title: true } } },
    });

    const funnelBreakdown = await this.prisma.candidate.groupBy({
      by: ['stageId'],
      _count: true,
    });

    return {
      counters: { candidates, vacancies, openRequests, myTasks, offers, checks },
      recentCandidates,
      funnelBreakdown,
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get()
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
