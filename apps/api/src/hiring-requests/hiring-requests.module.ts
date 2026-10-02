import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  HiringRequestStatus,
  Prisma,
  Priority,
  SystemRole,
} from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { HIRING_REQUEST_TRANSITIONS } from '@skillaz/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles, AuthUser } from '../common/guards';
import { NotificationsModule } from '../notifications/notifications.module';
import { pageResult, paginate } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.module';
import { QueueService } from '../queue/queue.module';

const LINK_MODE_ENV = process.env.VACANCY_LINK_MODE || 'PROFILE_CITY';

@Injectable()
export class HiringRequestsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private queues: QueueService,
  ) {}

  async list(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: HiringRequestStatus;
    orgUnitId?: string;
    candidateProfileId?: string;
    priority?: Priority;
    vacancyId?: string;
  }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where: Prisma.HiringRequestWhereInput = {
      AND: [
        query.search
          ? { title: { contains: query.search, mode: 'insensitive' } }
          : {},
        query.status ? { status: query.status } : {},
        query.orgUnitId ? { orgUnitId: query.orgUnitId } : {},
        query.candidateProfileId ? { candidateProfileId: query.candidateProfileId } : {},
        query.priority ? { priority: query.priority } : {},
        query.vacancyId ? { vacancyId: query.vacancyId } : {},
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.hiringRequest.findMany({
        where,
        skip,
        take,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        include: {
          orgUnit: { select: { id: true, name: true, city: true } },
          candidateProfile: { select: { id: true, name: true } },
          vacancy: { select: { id: true, title: true } },
          hiringManager: { select: { id: true, firstName: true, lastName: true } },
          recruiter: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { candidates: true } },
        },
      }),
      this.prisma.hiringRequest.count({ where }),
    ]);

    // Counters by funnel stages for each request's vacancy
    const withCounters = await Promise.all(
      items.map(async (item) => {
        const hiredCount = await this.prisma.candidate.count({
          where: { hiringRequestId: item.id, stage: { isFinal: true } },
        });
        if (!item.vacancyId) return { ...item, hiredCount, stageCounters: [] };
        const grouped = await this.prisma.candidate.groupBy({
          by: ['stageId'],
          where: { vacancyId: item.vacancyId, hiringRequestId: item.id },
          _count: true,
        });
        return { ...item, hiredCount, stageCounters: grouped };
      }),
    );

    return pageResult(withCounters, total, page, pageSize);
  }

  async get(id: string) {
    const item = await this.prisma.hiringRequest.findUnique({
      where: { id },
      include: {
        orgUnit: true,
        candidateProfile: true,
        vacancy: { include: { funnel: { include: { stages: { orderBy: { order: 'asc' } } } } } },
        hiringManager: { select: { id: true, firstName: true, lastName: true } },
        recruiter: { select: { id: true, firstName: true, lastName: true } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        candidates: {
          include: { stage: true },
          orderBy: { updatedAt: 'desc' },
          take: 50,
        },
        tasks: { where: { status: 'OPEN' } },
      },
    });
    if (!item) throw new NotFoundException();
    return item;
  }

  async create(data: {
    title: string;
    orgUnitId: string;
    candidateProfileId: string;
    positionsCount?: number;
    city?: string;
    priority?: Priority;
    comment?: string;
    hiringManagerId?: string;
    recruiterId?: string;
  }) {
    return this.prisma.hiringRequest.create({
      data: {
        title: data.title,
        orgUnitId: data.orgUnitId,
        candidateProfileId: data.candidateProfileId,
        positionsCount: data.positionsCount ?? 1,
        city: data.city,
        priority: data.priority ?? 'MEDIUM',
        comment: data.comment,
        hiringManagerId: data.hiringManagerId,
        recruiterId: data.recruiterId,
        status: 'NEW',
        statusHistory: { create: { toStatus: 'NEW' } },
        tasks: {
          create: {
            title: `Обработать заявку: ${data.title}`,
            description: 'Проверить и отправить на согласование HR BP',
            assigneeId: data.recruiterId,
          },
        },
      },
      include: { orgUnit: true, candidateProfile: true },
    });
  }

  async update(id: string, data: Partial<CreateHiringRequestDto>) {
    const request = await this.prisma.hiringRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException();
    if (request.status === 'CLOSED' || request.status === 'CANCELLED') {
      throw new BadRequestException('Закрытую или отменённую заявку изменить нельзя');
    }
    const patch: Prisma.HiringRequestUncheckedUpdateInput = {};
    if (data.title !== undefined) {
      const t = String(data.title).trim();
      if (!t) throw new BadRequestException('Укажите название заявки');
      patch.title = t;
    }
    if (data.orgUnitId) patch.orgUnitId = data.orgUnitId;
    if (data.candidateProfileId) patch.candidateProfileId = data.candidateProfileId;
    if (data.positionsCount !== undefined) patch.positionsCount = Math.max(1, Number(data.positionsCount) || 1);
    if (data.city !== undefined) patch.city = data.city || null;
    if (data.priority) patch.priority = data.priority;
    if (data.comment !== undefined) patch.comment = data.comment || null;
    if (data.hiringManagerId !== undefined) patch.hiringManagerId = data.hiringManagerId || null;
    if (data.recruiterId !== undefined) patch.recruiterId = data.recruiterId || null;
    await this.prisma.hiringRequest.update({ where: { id }, data: patch });
    return this.get(id);
  }

  async changeStatus(id: string, toStatus: HiringRequestStatus, user: AuthUser, comment?: string) {
    const request = await this.prisma.hiringRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException();

    const allowed = HIRING_REQUEST_TRANSITIONS[request.status as keyof typeof HIRING_REQUEST_TRANSITIONS] || [];
    if (!allowed.includes(toStatus as any)) {
      throw new BadRequestException('Такой переход статуса для заявки недоступен');
    }

    if (toStatus === 'APPROVED_HR_BP' || toStatus === 'REJECTED_HR_BP') {
      if (user.role !== SystemRole.HR_BP && user.role !== SystemRole.ADMIN) {
        throw new BadRequestException('Только HR BP может согласовывать заявки');
      }
    }

    const updated = await this.prisma.hiringRequest.update({
      where: { id },
      data: {
        status: toStatus,
        statusHistory: {
          create: {
            fromStatus: request.status,
            toStatus,
            comment,
            changedById: user.id,
          },
        },
      },
    });

    if (toStatus === 'IN_PROGRESS') {
      await this.ensureVacancy(updated.id);
      if (updated.recruiterId) {
        await this.prisma.task.create({
          data: {
            title: `Подбор по заявке: ${updated.title}`,
            hiringRequestId: updated.id,
            assigneeId: updated.recruiterId,
            createdById: user.id,
          },
        });
      }
    }

    const templateByStatus: Partial<Record<HiringRequestStatus, string>> = {
      PENDING_HR_BP: 'REQUEST_PENDING',
      APPROVED_HR_BP: 'REQUEST_APPROVED',
      REJECTED_HR_BP: 'REQUEST_REJECTED',
      PAUSED: 'REQUEST_PAUSED',
      CLOSED: 'REQUEST_CLOSED',
    };
    const code = templateByStatus[toStatus];
    if (code) {
      const full = await this.prisma.hiringRequest.findUnique({
        where: { id },
        select: {
          title: true,
          hiringManager: { select: { email: true } },
          recruiter: { select: { email: true } },
        },
      });
      const recipients = new Set<string>();
      const add = (e?: string | null) => {
        const v = String(e || '').trim().toLowerCase();
        if (v && v.includes('@')) recipients.add(v);
      };
      if (toStatus === 'PENDING_HR_BP') {
        const hrbps = await this.prisma.user.findMany({
          where: { role: 'HR_BP', isActive: true },
          select: { email: true },
          take: 20,
        });
        for (const h of hrbps) add(h.email);
      } else {
        add(full?.hiringManager?.email);
        add(full?.recruiter?.email);
      }
      if (!recipients.size) add(user.email);
      const title = full?.title || updated.title;
      for (const to of recipients) {
        if (to === user.email.toLowerCase() && recipients.size > 1) continue;
        await this.queues.enqueueNotification(code, { to, title });
        await this.notifications.sendEmail(to, code, { title });
      }
    }

    return this.get(id);
  }

  private async ensureVacancy(hiringRequestId: string) {
    const request = await this.prisma.hiringRequest.findUnique({
      where: { id: hiringRequestId },
      include: { orgUnit: true, candidateProfile: true, vacancy: true },
    });
    if (!request || request.vacancyId) return request?.vacancy;

    const funnel = await this.prisma.funnel.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!funnel) throw new BadRequestException('Нет активной воронки');

    const linkMode = LINK_MODE_ENV;
    const existing = await this.prisma.vacancy.findFirst({
      where: {
        candidateProfileId: request.candidateProfileId,
        isActive: true,
        ...(linkMode === 'PROFILE_ORG_UNIT'
          ? { orgUnitId: request.orgUnitId }
          : { city: request.city || request.orgUnit.city || undefined }),
      },
    });

    if (existing) {
      await this.prisma.hiringRequest.update({
        where: { id: request.id },
        data: { vacancyId: existing.id },
      });
      return existing;
    }

    const vacancy = await this.prisma.vacancy.create({
      data: {
        title: `${request.candidateProfile.name}${request.city || request.orgUnit.city ? ` — ${request.city || request.orgUnit.city}` : ''}`,
        candidateProfileId: request.candidateProfileId,
        orgUnitId: request.orgUnitId,
        city: request.city || request.orgUnit.city,
        funnelId: funnel.id,
        description: request.comment,
      },
    });

    await this.prisma.hiringRequest.update({
      where: { id: request.id },
      data: { vacancyId: vacancy.id },
    });
    return vacancy;
  }
}

class CreateHiringRequestDto {
  @IsString() title!: string;
  @IsUUID() orgUnitId!: string;
  @IsUUID() candidateProfileId!: string;
  @IsOptional() @IsInt() @Min(1) positionsCount?: number;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsUUID() hiringManagerId?: string;
  @IsOptional() @IsUUID() recruiterId?: string;
}

class ChangeStatusDto {
  @IsEnum(HiringRequestStatus) status!: HiringRequestStatus;
  @IsOptional() @IsString() comment?: string;
}

@ApiTags('hiring-requests')
@ApiBearerAuth()
@Controller('hiring-requests')
export class HiringRequestsController {
  constructor(private service: HiringRequestsService) {}

  @Get()
  list(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('search') search?: string,
    @Query('status') status?: HiringRequestStatus,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('candidateProfileId') candidateProfileId?: string,
    @Query('priority') priority?: Priority,
    @Query('vacancyId') vacancyId?: string,
  ) {
    return this.service.list({
      page, pageSize, search,
      status: status || undefined,
      orgUnitId: orgUnitId || undefined,
      candidateProfileId: candidateProfileId || undefined,
      priority: priority || undefined,
      vacancyId: vacancyId || undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Roles(
    SystemRole.ADMIN,
    SystemRole.HR_BP,
    SystemRole.RECRUITMENT_LEAD,
    SystemRole.HIRING_MANAGER,
    SystemRole.RECRUITER,
  )
  @Post()
  create(@Body() dto: CreateHiringRequestDto) {
    return this.service.create(dto);
  }

  @Roles(
    SystemRole.ADMIN,
    SystemRole.HR_BP,
    SystemRole.RECRUITMENT_LEAD,
    SystemRole.HIRING_MANAGER,
    SystemRole.RECRUITER,
  )
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateHiringRequestDto>) {
    return this.service.update(id, dto);
  }

  @Post(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.changeStatus(id, dto.status, user, dto.comment);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [HiringRequestsController],
  providers: [HiringRequestsService],
  exports: [HiringRequestsService],
})
export class HiringRequestsModule {}
