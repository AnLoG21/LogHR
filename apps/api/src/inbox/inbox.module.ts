import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/guards';
import { visibilityWhere } from '../common/visibility';

export type HubItemKind = 'max' | 'task' | 'stage';

export type HubItem = {
  id: string;
  kind: HubItemKind;
  title: string;
  text: string;
  at: string;
  href: string;
};

@Injectable()
export class UserInboxService {
  constructor(private prisma: PrismaService) {}

  private nameOf(c: { firstName: string | null; lastName: string | null; middleName?: string | null }) {
    return [c.lastName, c.firstName, c.middleName].filter(Boolean).join(' ') || 'Кандидат';
  }

  private extraOf(extra: unknown) {
    const e = (extra && typeof extra === 'object' ? extra : {}) as {
      maxUnread?: number;
      maxLastInbound?: { id: string; text: string; at: string };
    };
    return e;
  }

  async hub(user: AuthUser) {
    const vis = visibilityWhere(user);
    const candidateScope: Prisma.CandidateWhereInput = {
      isDepersonalized: false,
      AND: [vis],
    };

    const [maxCandidates, openTasks, tasksOpen, stageRows] = await Promise.all([
      this.prisma.candidate.findMany({
        where: candidateScope,
        select: { id: true, firstName: true, lastName: true, middleName: true, extra: true },
        orderBy: { updatedAt: 'desc' },
        take: 2000,
      }),
      this.prisma.task.findMany({
        where: { status: 'OPEN', assigneeId: user.id },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 20,
        include: { candidate: { select: { id: true, firstName: true, lastName: true, middleName: true } } },
      }),
      this.prisma.task.count({ where: { status: 'OPEN', assigneeId: user.id } }),
      this.prisma.candidateStatusHistory.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          changedById: { not: user.id },
          candidate: {
            isDepersonalized: false,
            AND: [
              vis,
              {
                OR: [
                  { assigneeId: user.id },
                  { hiringRequest: { recruiterId: user.id } },
                  { hiringRequest: { hiringManagerId: user.id } },
                ],
              },
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          stage: { select: { name: true } },
          candidate: { select: { id: true, firstName: true, lastName: true, middleName: true } },
          changedBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const items: HubItem[] = [];
    let maxUnread = 0;

    for (const c of maxCandidates) {
      const extra = this.extraOf(c.extra);
      const n = extra.maxUnread || 0;
      if (n <= 0) continue;
      maxUnread += n;
      const last = extra.maxLastInbound;
      if (!last) continue;
      items.push({
        id: `max:${last.id}`,
        kind: 'max',
        title: this.nameOf(c),
        text: last.text,
        at: last.at,
        href: `/messengers?chat=${c.id}`,
      });
    }

    for (const t of openTasks) {
      const due = t.dueAt ? ` · до ${t.dueAt.toLocaleDateString('ru-RU')}` : '';
      items.push({
        id: `task:${t.id}`,
        kind: 'task',
        title: t.title,
        text: t.candidate ? this.nameOf(t.candidate) + due : (t.description || 'Открытая задача') + due,
        at: (t.dueAt || t.createdAt).toISOString(),
        href: t.candidateId ? `/candidates/${t.candidateId}` : '/tasks',
      });
    }

    for (const h of stageRows) {
      const who = h.changedBy ? `${h.changedBy.lastName} ${h.changedBy.firstName}`.trim() : 'Система';
      items.push({
        id: `stage:${h.id}`,
        kind: 'stage',
        title: this.nameOf(h.candidate),
        text: `${h.stage.name}${h.comment ? ` — ${h.comment}` : ''} (${who})`,
        at: h.createdAt.toISOString(),
        href: `/candidates/${h.candidate.id}`,
      });
    }

    items.sort((a, b) => (a.at < b.at ? 1 : -1));

    const total = maxUnread + tasksOpen + stageRows.length;

    return {
      total,
      maxUnread,
      tasksOpen,
      items: items.slice(0, 40),
    };
  }
}

@ApiTags('inbox')
@ApiBearerAuth()
@Controller('inbox')
export class InboxController {
  constructor(private service: UserInboxService) {}

  @Get('hub')
  hub(@CurrentUser() user: AuthUser) {
    return this.service.hub(user);
  }
}

@Module({
  controllers: [InboxController],
  providers: [UserInboxService],
  exports: [UserInboxService],
})
export class InboxModule {}
