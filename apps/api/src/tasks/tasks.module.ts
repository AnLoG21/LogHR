import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async list(user: AuthUser, query: { page?: number; pageSize?: number; status?: TaskStatus | 'ALL'; mine?: boolean; candidateId?: string }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where = {
      ...(query.status === 'ALL' ? {} : query.status ? { status: query.status } : { status: TaskStatus.OPEN }),
      ...(query.mine !== false ? { OR: [{ assigneeId: user.id }, { createdById: user.id }] } : {}),
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true } },
          hiringRequest: { select: { id: true, title: true } },
          stage: true,
          assignee: { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  create(data: {
    title: string;
    description?: string;
    assigneeId?: string;
    candidateId?: string;
    hiringRequestId?: string;
    dueAt?: string;
  }, user: AuthUser) {
    const title = String(data.title || '').trim();
    if (!title) throw new BadRequestException('Укажите, что нужно сделать');
    return this.prisma.task.create({
      data: {
        title,
        description: data.description,
        assigneeId: data.assigneeId || user.id,
        candidateId: data.candidateId,
        hiringRequestId: data.hiringRequestId,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        createdById: user.id,
      },
    });
  }

  updateStatus(id: string, status: TaskStatus) {
    return this.prisma.task.update({ where: { id }, data: { status } });
  }

  update(id: string, data: { title?: string; description?: string | null; assigneeId?: string | null; dueAt?: string | null; candidateId?: string | null }) {
    const patch: any = {};
    if (data.title !== undefined) {
      const t = String(data.title).trim();
      if (!t) throw new BadRequestException('Укажите, что нужно сделать');
      patch.title = t;
    }
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId || null;
    if (data.candidateId !== undefined) patch.candidateId = data.candidateId || null;
    if (data.dueAt !== undefined) patch.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    return this.prisma.task.update({ where: { id }, data: patch });
  }

  remove(id: string) {
    return this.prisma.task.delete({ where: { id } });
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private service: TasksService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: TaskStatus,
    @Query('mine') mine?: string,
    @Query('candidateId') candidateId?: string,
  ) {
    return this.service.list(user, { page, pageSize, status, mine: mine !== 'false', candidateId });
  }

  @Post()
  create(
    @Body() dto: { title: string; description?: string; assigneeId?: string; candidateId?: string; hiringRequestId?: string; dueAt?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id/status')
  status(@Param('id') id: string, @Body('status') status: TaskStatus) {
    return this.service.updateStatus(id, status);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { title?: string; description?: string; assigneeId?: string; dueAt?: string; candidateId?: string }) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ controllers: [TasksController], providers: [TasksService], exports: [TasksService] })
export class TasksModule {}
