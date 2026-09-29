import {
  Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query,
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

  async list(user: AuthUser, query: { page?: number; pageSize?: number; status?: TaskStatus; mine?: boolean }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where = {
      ...(query.status ? { status: query.status } : { status: TaskStatus.OPEN }),
      ...(query.mine !== false ? { assigneeId: user.id } : {}),
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
    return this.prisma.task.create({
      data: {
        title: data.title,
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
  ) {
    return this.service.list(user, { page, pageSize, status, mine: mine !== 'false' });
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
}

@Module({ controllers: [TasksController], providers: [TasksService], exports: [TasksService] })
export class TasksModule {}
