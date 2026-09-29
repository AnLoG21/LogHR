import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JobBoard, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';
import { getJobBoardAdapter, JobBoardPublishInput, JobBoardSearchInput } from './adapters';

export * from './adapters';

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

  async syncResponses(board: JobBoard, vacancyExternalId?: string) {
    const adapter = getJobBoardAdapter(board);
    const responses = await adapter.fetchResponses(vacancyExternalId);
    const created = [];
    for (const r of responses) {
      const candidate = await this.prisma.candidate.create({
        data: {
          firstName: r.firstName || 'Без',
          lastName: r.lastName || 'Имени',
          phone: r.phone,
          email: r.email,
          source: board,
          addType: 'RESPONSE',
          resumeText: r.resumeText,
          externalId: r.externalId,
          responses: {
            create: {
              board,
              externalId: r.externalId,
              rawPayload: r.raw as any,
            },
          },
        },
      });
      created.push(candidate);
    }
    return { imported: created.length, candidates: created };
  }

  messengerLinks(phone?: string) {
    const normalized = (phone || '').replace(/\D/g, '');
    return {
      whatsapp: normalized ? `https://wa.me/${normalized}` : 'https://web.whatsapp.com/',
      telegram: normalized ? `https://t.me/+${normalized}` : 'https://web.telegram.org/',
      max: 'https://max.ru/',
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
  sync(@Body() dto: { board: JobBoard; vacancyExternalId?: string }) {
    return this.service.syncResponses(dto.board, dto.vacancyExternalId);
  }

  @Get('messenger-links')
  links(@Query('phone') phone?: string) {
    return this.service.messengerLinks(phone);
  }
}

@Module({ controllers: [JobBoardsController], providers: [JobBoardsService], exports: [JobBoardsService] })
export class JobBoardsModule {}
