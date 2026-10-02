import { Body, Controller, Get, Headers, Injectable, Module, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JobBoard, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';
import { getHhAdapter, getJobBoardAdapter, JobBoardSearchInput } from './adapters';

export * from './adapters';

function assertWorker(workerToken?: string) {
  const expected = process.env.WORKER_TOKEN;
  if (!expected || workerToken !== expected) {
    throw new UnauthorizedException('Invalid worker token');
  }
}

@Injectable()
export class JobBoardsService {
  constructor(private prisma: PrismaService) {}

  listAccounts() {
    return this.prisma.jobBoardAccount.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createAccount(data: { board: JobBoard; name: string; credentials: Record<string, unknown> }) {
    return this.prisma.jobBoardAccount.create({
      data: {
        board: data.board,
        name: data.name,
        credentials: data.credentials as any,
      },
    });
  }

  async search(board: JobBoard, input: JobBoardSearchInput) {
    const adapter = getJobBoardAdapter(board);
    return adapter.search(input);
  }

  /** Import responses for one board vacancy external id, or all published HH vacancies when omitted. */
  async syncResponses(board: JobBoard, vacancyExternalId?: string) {
    const adapter = getJobBoardAdapter(board);
    if (!adapter.configured()) {
      return { imported: 0, updated: 0, skipped: 0, configured: false, note: `${board}: площадка не подключена` };
    }

    const pubs = await this.prisma.publication.findMany({
      where: {
        board,
        status: 'PUBLISHED',
        externalId: vacancyExternalId ? vacancyExternalId : { not: null },
      },
      include: {
        vacancy: {
          include: { funnel: { include: { stages: { orderBy: { order: 'asc' } } } } },
        },
      },
    });

    if (!pubs.length && vacancyExternalId) {
      // Still try fetch without local publication link
      const responses = await adapter.fetchResponses(vacancyExternalId);
      return this.importResponseItems(board, responses, null);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const details: any[] = [];
    for (const pub of pubs) {
      const responses = await adapter.fetchResponses(pub.externalId!);
      const stageId = pub.vacancy?.funnel?.stages?.[0]?.id;
      const r = await this.importResponseItems(board, responses, {
        vacancyId: pub.vacancyId,
        hiringRequestId: undefined,
        stageId,
      });
      imported += r.imported;
      updated += r.updated;
      skipped += r.skipped;
      details.push({ vacancyExternalId: pub.externalId, vacancyId: pub.vacancyId, ...r });
    }
    return { imported, updated, skipped, configured: true, publications: pubs.length, details };
  }

  private async importResponseItems(
    board: JobBoard,
    responses: Awaited<ReturnType<ReturnType<typeof getJobBoardAdapter>['fetchResponses']>>,
    link: { vacancyId?: string; hiringRequestId?: string; stageId?: string } | null,
  ) {
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    for (const r of responses) {
      const resumeKey = r.resumeId || r.externalId;
      if (!resumeKey) {
        skipped++;
        continue;
      }
      const existing =
        (await this.prisma.candidate.findFirst({ where: { externalId: resumeKey } })) ||
        (r.email ? await this.prisma.candidate.findFirst({ where: { email: r.email } }) : null) ||
        (r.phone ? await this.prisma.candidate.findFirst({ where: { phone: r.phone } }) : null);

      if (existing) {
        await this.prisma.candidate.update({
          where: { id: existing.id },
          data: {
            externalId: resumeKey,
            resumeText: r.resumeText || existing.resumeText,
            phone: r.phone || existing.phone,
            email: r.email || existing.email,
            city: r.city || existing.city,
            desiredPosition: r.desiredPosition || existing.desiredPosition,
            currentPosition: r.currentPosition || existing.currentPosition,
            resumeUpdatedAt: new Date(),
            ...(link?.vacancyId && !existing.vacancyId ? { vacancyId: link.vacancyId } : {}),
            ...(link?.stageId && !existing.stageId ? { stageId: link.stageId, stageChangedAt: new Date() } : {}),
          },
        });
        const already = await this.prisma.candidateResponse.findFirst({
          where: { candidateId: existing.id, board, externalId: r.externalId },
        });
        if (!already) {
          await this.prisma.candidateResponse.create({
            data: {
              candidateId: existing.id,
              board,
              externalId: r.externalId,
              rawPayload: r.raw as any,
            },
          });
        }
        updated++;
        continue;
      }

      await this.prisma.candidate.create({
        data: {
          firstName: r.firstName || 'Без',
          lastName: r.lastName || 'Имени',
          middleName: r.middleName,
          phone: r.phone,
          email: r.email,
          city: r.city,
          desiredPosition: r.desiredPosition,
          currentPosition: r.currentPosition,
          source: board,
          addType: 'RESPONSE',
          resumeText: r.resumeText,
          externalId: resumeKey,
          resumeUpdatedAt: new Date(),
          vacancyId: link?.vacancyId,
          stageId: link?.stageId,
          stageChangedAt: link?.stageId ? new Date() : undefined,
          pdnConsentAt: new Date(),
          responses: {
            create: {
              board,
              externalId: r.externalId,
              rawPayload: r.raw as any,
            },
          },
          ...(link?.stageId
            ? { statusHistory: { create: { stageId: link.stageId, comment: `Отклик с ${board}` } } }
            : {}),
        },
      });
      imported++;
    }
    return { imported, updated, skipped, total: responses.length };
  }

  /** Refresh resume text/contacts from HH for candidates with externalId. */
  async refreshHhResumes(limit = 30) {
    const hh = getHhAdapter();
    if (!hh?.configured()) {
      return { updated: 0, configured: false, note: 'HeadHunter не подключён' };
    }
    const candidates = await this.prisma.candidate.findMany({
      where: { source: 'HH', externalId: { not: null }, isDepersonalized: false },
      orderBy: [{ resumeUpdatedAt: 'asc' }, { updatedAt: 'asc' }],
      take: Math.min(100, Math.max(1, limit)),
    });
    let updated = 0;
    let failed = 0;
    for (const c of candidates) {
      try {
        const fresh = await hh.fetchResume(c.externalId!);
        if (!fresh) {
          failed++;
          continue;
        }
        await this.prisma.candidate.update({
          where: { id: c.id },
          data: {
            firstName: fresh.firstName || c.firstName,
            lastName: fresh.lastName || c.lastName,
            middleName: fresh.middleName || c.middleName,
            phone: fresh.phone || c.phone,
            email: fresh.email || c.email,
            city: fresh.city || c.city,
            desiredPosition: fresh.desiredPosition || c.desiredPosition,
            currentPosition: fresh.currentPosition || c.currentPosition,
            resumeText: fresh.resumeText || c.resumeText,
            resumeUpdatedAt: new Date(),
          },
        });
        updated++;
      } catch {
        failed++;
      }
    }
    return { updated, failed, scanned: candidates.length, configured: true };
  }

  async refreshOneCandidate(candidateId: string) {
    const hh = getHhAdapter();
    if (!hh?.configured()) return { ok: false, note: 'HeadHunter не подключён' };
    const c = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!c?.externalId) return { ok: false, note: 'У кандидата нет связи с резюме на HeadHunter' };
    const fresh = await hh.fetchResume(c.externalId);
    if (!fresh) return { ok: false, note: 'HH не вернул резюме' };
    const updated = await this.prisma.candidate.update({
      where: { id: c.id },
      data: {
        firstName: fresh.firstName || c.firstName,
        lastName: fresh.lastName || c.lastName,
        middleName: fresh.middleName || c.middleName,
        phone: fresh.phone || c.phone,
        email: fresh.email || c.email,
        city: fresh.city || c.city,
        desiredPosition: fresh.desiredPosition || c.desiredPosition,
        currentPosition: fresh.currentPosition || c.currentPosition,
        resumeText: fresh.resumeText || c.resumeText,
        resumeUpdatedAt: new Date(),
      },
    });
    return { ok: true, candidate: updated };
  }

  messengerLinks(phone?: string, candidateId?: string) {
    const normalized = (phone || '').replace(/\D/g, '');
    const bot = (process.env.MAX_BOT_USERNAME || '').replace(/^@/, '');
    const invite =
      bot && candidateId
        ? `https://max.ru/${bot}?start=c_${candidateId.replace(/-/g, '').slice(0, 32)}`
        : null;
    const shareText = invite
      ? `Здравствуйте! Напишите нам в MAX: ${invite}`
      : 'Здравствуйте! Напишите нам в мессенджер MAX.';
    return {
      whatsapp: normalized ? `https://wa.me/${normalized}` : 'https://web.whatsapp.com/',
      telegram: normalized ? `https://t.me/+${normalized}` : 'https://web.telegram.org/',
      max: invite || 'https://max.ru/',
      maxInvite: invite,
      maxShare: `https://max.ru/:share?text=${encodeURIComponent(shareText)}`,
      maxNote: invite
        ? 'У MAX нет чата по номеру телефона. Отправьте кандидату ссылку-приглашение — он откроет бота, и переписка появится в карточке.'
        : 'Бот MAX ещё не настроен. Администратор задаёт MAX_BOT_TOKEN и MAX_BOT_USERNAME.',
    };
  }

  async hhStatus() {
    const { resolveHhToken } = await import('../integrations/hh-token');
    const configured = !!(await resolveHhToken());
    return {
      configured,
      note: configured
        ? 'HeadHunter подключён — можно синхронизировать отклики и резюме'
        : 'HeadHunter пока не подключён. Откройте Администрирование → Подключить HeadHunter.',
    };
  }
}

@ApiTags('job-boards')
@ApiBearerAuth()
@Controller('job-boards')
export class JobBoardsController {
  constructor(private service: JobBoardsService) {}

  @Get('accounts')
  accounts() {
    return this.service.listAccounts();
  }

  @Get('hh-status')
  hhStatus() {
    return this.service.hhStatus();
  }

  @Roles(SystemRole.ADMIN)
  @Post('accounts')
  createAccount(@Body() dto: { board: JobBoard; name: string; credentials: Record<string, unknown> }) {
    return this.service.createAccount(dto);
  }

  @Post('search')
  search(@Body() dto: { board: JobBoard } & JobBoardSearchInput) {
    const { board, ...input } = dto;
    return this.service.search(board, input);
  }

  @Post('sync-responses')
  sync(@Body() dto: { board?: JobBoard; vacancyExternalId?: string }) {
    return this.service.syncResponses(dto.board || 'HH', dto.vacancyExternalId);
  }

  @Public()
  @Post('sync-responses/cron')
  syncCron(@Headers('x-worker-token') workerToken?: string) {
    assertWorker(workerToken);
    return this.service.syncResponses('HH');
  }

  @Post('refresh-resumes')
  refreshResumes(@Body() dto: { limit?: number }) {
    return this.service.refreshHhResumes(dto?.limit ?? 30);
  }

  @Public()
  @Post('refresh-resumes/cron')
  refreshCron(@Headers('x-worker-token') workerToken?: string, @Body() dto?: { limit?: number }) {
    assertWorker(workerToken);
    return this.service.refreshHhResumes(dto?.limit ?? 30);
  }

  @Post('candidates/:id/refresh-resume')
  refreshOne(@Param('id') id: string) {
    return this.service.refreshOneCandidate(id);
  }

  @Get('messenger-links')
  links(@Query('phone') phone?: string, @Query('candidateId') candidateId?: string) {
    return this.service.messengerLinks(phone, candidateId);
  }
}

@Module({ controllers: [JobBoardsController], providers: [JobBoardsService], exports: [JobBoardsService] })
export class JobBoardsModule {}
