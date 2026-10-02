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

@Injectable()
export class ChecksService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

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
    return check;
  }

  async changeStatus(id: string, status: CheckStatus, user: AuthUser, comment?: string, formData?: any) {
    const updated = await this.prisma.check.update({
      where: { id },
      data: { status, comment, ...(formData ? { formData } : {}) },
    });
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'status_change',
      entity: 'Check',
      entityId: id,
      meta: { status, candidateId: updated.candidateId, comment },
    });
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
    return this.prisma.check.update({
      where: { id: check.id },
      data: {
        formData: { ...(typeof check.formData === 'object' && check.formData ? check.formData : {}), ...formData },
        status,
        comment,
      },
    });
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
  imports: [AuditModule],
  controllers: [ChecksController],
  providers: [ChecksService],
  exports: [ChecksService],
})
export class ChecksModule {}
