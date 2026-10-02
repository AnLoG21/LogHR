import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(input: {
    actorId?: string | null;
    actorEmail?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    meta?: Record<string, unknown> | null;
  }) {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorId: input.actorId || undefined,
          actorEmail: input.actorEmail || undefined,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId || undefined,
          meta: (input.meta || undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch {
      /* audit must not break business flow */
    }
  }

  async list(query: { page?: number; pageSize?: number; entity?: string; actorId?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 40));
    const where: Prisma.AuditEventWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD)
  @Get()
  list(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('entity') entity?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.audit.list({ page, pageSize, entity, actorId });
  }
}

@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
