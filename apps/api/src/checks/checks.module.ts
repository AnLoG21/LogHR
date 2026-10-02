import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CheckStatus, CheckType, Prisma, SystemRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, Public, Roles } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';
import { visibilityWhere } from '../common/visibility';
import { AuditModule, AuditService } from '../audit/audit.module';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';

@Injectable()
export class ChecksService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  async list(
    query: { page?: number; pageSize?: number; type?: CheckType; status?: CheckStatus },
    user: AuthUser,
  ) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const candVis = visibilityWhere({
      id: user.id,
      role: user.role as any,
      orgUnitId: (user as any).orgUnitId,
      visibilityRules: (user as any).visibilityRules,
    });
    const where: Prisma.CheckWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      candidate: { isDepersonalized: false, AND: [candVis] },
    };
    const [items, total] = await Promise.all([
      this.prisma.check.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.check.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async create(data: { candidateId: string; type: CheckType; assigneeId?: string; formData?: any }, user: AuthUser) {
    const check = await this.prisma.check.create({
      data: {
        candidateId: data.candidateId,
        type: data.type,
        assigneeId: data.assigneeId || (data.type === 'SECURITY' ? undefined : user.id),
        formData: data.formData,
        externalToken: randomUUID(),
      },
    });
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'create',
      entity: 'Check',
      entityId: check.id,
      meta: { candidateId: data.candidateId, type: data.type },
    });

    const candidate = await this.prisma.candidate.findUnique({
      where: { id: data.candidateId },
      select: { firstName: true, lastName: true },
    });
    const name = candidate ? [candidate.lastName, candidate.firstName].filter(Boolean).join(' ') : 'кандидат';
    let assigneeEmail: string | undefined;
    if (check.assigneeId) {
      const a = await this.prisma.user.findUnique({ where: { id: check.assigneeId }, select: { email: true } });
      assigneeEmail = a?.email;
    } else if (data.type === 'SECURITY') {
      const sec = await this.prisma.user.findFirst({
        where: { role: 'SECURITY', isActive: true },
        select: { email: true },
      });
      assigneeEmail = sec?.email;
    }
    if (assigneeEmail && assigneeEmail !== user.email) {
      void this.notifications.sendEmail(assigneeEmail, 'CHECK_ASSIGNED', { name }).catch(() => undefined);
    }
    return check;
  }

  async changeStatus(id: string, status: CheckStatus, user: AuthUser, comment?: string, formData?: any) {
    const updated = await this.prisma.check.update({
      where: { id },
      data: { status, comment, ...(formData ? { formData } : {}) },
      include: {
        candidate: {
          select: {
            firstName: true,
            lastName: true,
            assignee: { select: { email: true } },
            hiringRequest: {
              select: {
                recruiter: { select: { email: true } },
                hiringManager: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'status_change',
      entity: 'Check',
      entityId: id,
      meta: { status, candidateId: updated.candidateId, comment },
    });

    if (status === 'APPROVED' || status === 'REJECTED') {
      const name = [updated.candidate.lastName, updated.candidate.firstName].filter(Boolean).join(' ');
      const staff = new Set<string>();
      const add = (e?: string | null) => {
        const v = String(e || '').trim().toLowerCase();
        if (v && v.includes('@') && v !== user.email.toLowerCase()) staff.add(v);
      };
      add(updated.candidate.assignee?.email);
      add(updated.candidate.hiringRequest?.recruiter?.email);
      add(updated.candidate.hiringRequest?.hiringManager?.email);
      for (const to of staff) {
        void this.notifications
          .sendEmail(to, 'CHECK_RESULT', { name, status: status === 'APPROVED' ? 'одобрена' : 'отклонена' })
          .catch(() => undefined);
      }
    }
    return updated;
  }

  async getByToken(token: string) {
    const check = await this.prisma.check.findUnique({
      where: { externalToken: token },
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            city: true,
            currentPosition: true,
            desiredPosition: true,
            about: true,
            resumeText: true,
            vacancy: { select: { title: true, city: true } },
          },
        },
        assignee: { select: { firstName: true, lastName: true } },
      },
    });
    if (!check) throw new NotFoundException();
    const c = check.candidate as any;
    return {
      ...check,
      candidate: c
        ? {
            ...c,
            resumePreview: (c.resumeText || c.about || '').slice(0, 1200),
            resumeText: undefined,
            about: undefined,
          }
        : null,
    };
  }

  async submitExternal(token: string, formData: any) {
    const check = await this.getByToken(token);
    if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(check.status)) {
      return check;
    }
    const decision = String(formData?.decision || '').toUpperCase();
    let status: CheckStatus = 'IN_PROGRESS';
    if (decision === 'APPROVED' || decision === 'YES' || formData?.approved === true) status = 'APPROVED';
    if (decision === 'REJECTED' || decision === 'NO' || formData?.approved === false) status = 'REJECTED';
    const comment = formData?.notes || formData?.comment || check.comment;
    const updated = await this.prisma.check.update({
      where: { id: check.id },
      data: {
        formData: { ...(typeof check.formData === 'object' && check.formData ? check.formData : {}), ...formData },
        status,
        comment,
      },
      include: {
        candidate: {
          select: {
            firstName: true,
            lastName: true,
            assignee: { select: { email: true } },
            hiringRequest: {
              select: {
                recruiter: { select: { email: true } },
                hiringManager: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    if (status === 'APPROVED' || status === 'REJECTED') {
      const name = [updated.candidate.lastName, updated.candidate.firstName].filter(Boolean).join(' ');
      const staff = new Set<string>();
      const add = (e?: string | null) => {
        const v = String(e || '').trim().toLowerCase();
        if (v && v.includes('@')) staff.add(v);
      };
      add(updated.candidate.assignee?.email);
      add(updated.candidate.hiringRequest?.recruiter?.email);
      add(updated.candidate.hiringRequest?.hiringManager?.email);
      for (const to of staff) {
        void this.notifications
          .sendEmail(to, 'CHECK_RESULT', { name, status: status === 'APPROVED' ? 'одобрена' : 'отклонена' })
          .catch(() => undefined);
      }
    }
    return updated;
  }
}

@ApiTags('checks')
@Controller('checks')
export class ChecksController {
  constructor(private service: ChecksService) {}

  @ApiBearerAuth()
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('type') type?: CheckType,
    @Query('status') status?: CheckStatus,
  ) {
    return this.service.list({ page, pageSize, type, status }, user);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.SECURITY, SystemRole.HR_BP)
  @Post()
  create(
    @Body() dto: { candidateId: string; type: CheckType; assigneeId?: string; formData?: any },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user);
  }

  @ApiBearerAuth()
  @Post(':id/status')
  status(
    @Param('id') id: string,
    @Body() dto: { status: CheckStatus; comment?: string; formData?: any },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.changeStatus(id, dto.status, user, dto.comment, dto.formData);
  }

  @Public()
  @Get('public/:token')
  publicGet(@Param('token') token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post('public/:token')
  publicSubmit(@Param('token') token: string, @Body() formData: any) {
    return this.service.submitExternal(token, formData);
  }
}

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [ChecksController],
  providers: [ChecksService],
  exports: [ChecksService],
})
export class ChecksModule {}
