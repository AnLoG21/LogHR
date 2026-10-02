import {
  BadRequestException, Body, Controller, Delete, Get, Module, Injectable, NotFoundException, Param, Post, Patch, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import type { FunnelTransitions } from '@skillaz/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

@Injectable()
export class FunnelsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.funnel.findMany({
      where: { isActive: true },
      include: { stages: { orderBy: { order: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    return this.prisma.funnel.findUnique({
      where: { id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }

  private newCode(prefix: string) {
    return `${prefix}_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  async create(data: { name: string; copyFromId?: string }) {
    const name = String(data.name || '').trim();
    if (!name) throw new BadRequestException('Укажите название воронки');
    const source = data.copyFromId
      ? await this.prisma.funnel.findUnique({ where: { id: data.copyFromId }, include: { stages: { orderBy: { order: 'asc' } } } })
      : null;
    if (data.copyFromId && !source) throw new BadRequestException('Воронка-образец не найдена');
    const stages = source?.stages.length
      ? source.stages.map((s) => ({ code: s.code, name: s.name, order: s.order, isFinal: s.isFinal, color: s.color }))
      : [
          { code: 'NEW', name: 'Новый отклик', order: 1, isFinal: false },
          { code: 'INTERVIEW', name: 'Собеседование', order: 2, isFinal: false },
          { code: 'OFFER', name: 'Оффер', order: 3, isFinal: false },
          { code: 'HIRED', name: 'Выход на работу', order: 4, isFinal: true },
        ];
    return this.prisma.funnel.create({
      data: {
        name,
        code: this.newCode('F'),
        transitions: (source?.transitions ?? undefined) as any,
        stages: { create: stages },
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }

  async update(id: string, data: { name?: string }) {
    const funnel = await this.prisma.funnel.findUnique({ where: { id } });
    if (!funnel) throw new NotFoundException();
    const name = String(data.name || '').trim();
    if (!name) throw new BadRequestException('Укажите название воронки');
    return this.prisma.funnel.update({ where: { id }, data: { name } });
  }

  async archive(id: string) {
    const funnel = await this.prisma.funnel.findUnique({ where: { id } });
    if (!funnel) throw new NotFoundException();
    const vacancies = await this.prisma.vacancy.count({ where: { funnelId: id, isActive: true } });
    if (vacancies) {
      throw new BadRequestException(`Воронка используется в активных вакансиях (${vacancies}). Сначала переведите их на другую воронку или в архив`);
    }
    const others = await this.prisma.funnel.count({ where: { isActive: true, id: { not: id } } });
    if (!others) throw new BadRequestException('Нельзя убрать последнюю воронку');
    await this.prisma.funnel.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }

  async addStage(funnelId: string, data: { name: string; code?: string; order?: number; isFinal?: boolean }) {
    const name = String(data.name || '').trim();
    if (!name) throw new BadRequestException('Укажите название этапа');
    const max = await this.prisma.funnelStage.aggregate({
      where: { funnelId },
      _max: { order: true },
    });
    return this.prisma.funnelStage.create({
      data: {
        funnelId,
        name,
        code: this.newCode('S'),
        order: data.order ?? (max._max.order ?? 0) + 1,
        isFinal: !!data.isFinal,
      },
    });
  }

  async updateStage(id: string, data: { name?: string; isFinal?: boolean; color?: string }) {
    const stage = await this.prisma.funnelStage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException();
    const patch: { name?: string; isFinal?: boolean; color?: string } = {};
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new BadRequestException('Укажите название этапа');
      patch.name = name;
    }
    if (data.isFinal !== undefined) patch.isFinal = !!data.isFinal;
    if (data.color !== undefined) patch.color = data.color;
    return this.prisma.funnelStage.update({ where: { id }, data: patch });
  }

  async stageUsage(id: string) {
    const [candidates, history, scenarios] = await Promise.all([
      this.prisma.candidate.count({ where: { stageId: id } }),
      this.prisma.candidateStatusHistory.count({ where: { stageId: id } }),
      this.prisma.assessmentScenario.count({ where: { funnelStageId: id } }),
    ]);
    return { candidates, history, scenarios };
  }

  async removeStage(id: string, moveToStageId?: string) {
    const stage = await this.prisma.funnelStage.findUnique({ where: { id }, include: { funnel: true } });
    if (!stage) throw new NotFoundException();
    const siblings = await this.prisma.funnelStage.count({ where: { funnelId: stage.funnelId } });
    if (siblings <= 1) throw new BadRequestException('В воронке должен остаться хотя бы один этап');
    const usage = await this.stageUsage(id);
    let target: { id: string; name: string } | null = null;
    if (usage.candidates || usage.history) {
      if (!moveToStageId) throw new BadRequestException('Выберите этап, на который перенести кандидатов');
      target = await this.prisma.funnelStage.findFirst({
        where: { id: moveToStageId, funnelId: stage.funnelId, NOT: { id } },
        select: { id: true, name: true },
      });
      if (!target) throw new BadRequestException('Этап для переноса не найден в этой воронке');
    }
    const note = `этап «${stage.name}» удалён`;
    await this.prisma.$transaction(async (tx) => {
      if (target) {
        await tx.candidate.updateMany({ where: { stageId: id }, data: { stageId: target.id } });
        await tx.$executeRaw`UPDATE "CandidateStatusHistory" SET "stageId" = ${target.id}, "comment" = CASE WHEN "comment" IS NULL OR "comment" = '' THEN ${note} ELSE "comment" || ' · ' || ${note} END WHERE "stageId" = ${id}`;
      }
      await tx.task.updateMany({ where: { stageId: id }, data: { stageId: null } });
      await tx.assessmentScenario.deleteMany({ where: { funnelStageId: id } });
      await tx.funnelStage.delete({ where: { id } });
      const rest = await tx.funnelStage.findMany({ where: { funnelId: stage.funnelId }, orderBy: { order: 'asc' } });
      for (const [i, s] of rest.entries()) {
        if (s.order !== i + 1) await tx.funnelStage.update({ where: { id: s.id }, data: { order: i + 1 } });
      }
      const transitions = stage.funnel.transitions as FunnelTransitions | null;
      if (transitions?.stageRoles?.[stage.code]) {
        const { [stage.code]: _removed, ...stageRoles } = transitions.stageRoles;
        await tx.funnel.update({ where: { id: stage.funnelId }, data: { transitions: { ...transitions, stageRoles } as any } });
      }
    });
    return { ok: true };
  }

  async reorder(funnelId: string, stageIds: string[]) {
    await Promise.all(
      stageIds.map((id, order) =>
        this.prisma.funnelStage.updateMany({ where: { id, funnelId }, data: { order: order + 1 } }),
      ),
    );
    return this.get(funnelId);
  }

  async setTransitions(funnelId: string, transitions: unknown) {
    const funnel = await this.prisma.funnel.findUnique({ where: { id: funnelId }, include: { stages: true } });
    if (!funnel) throw new NotFoundException();
    const raw = (transitions as FunnelTransitions | null)?.stageRoles;
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
      throw new BadRequestException('stageRoles должен быть объектом { КОД_ЭТАПА: [роли] }');
    }
    const codes = new Set(funnel.stages.map((s) => s.code));
    const roles = new Set<string>(Object.values(SystemRole));
    const stageRoles: Record<string, string[]> = {};
    for (const [code, list] of Object.entries(raw || {})) {
      if (!codes.has(code)) throw new BadRequestException(`Нет этапа с кодом ${code}`);
      if (!Array.isArray(list) || list.some((r) => !roles.has(r))) {
        throw new BadRequestException(`Некорректные роли для этапа ${code}`);
      }
      if (list.length) stageRoles[code] = [...new Set(list)];
    }
    return this.prisma.funnel.update({
      where: { id: funnelId },
      data: { transitions: { stageRoles } },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }
}

@ApiTags('funnels')
@ApiBearerAuth()
@Controller('funnels')
export class FunnelsController {
  constructor(private service: FunnelsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Post()
  create(@Body() dto: { name: string; copyFromId?: string }) {
    return this.service.create(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { name?: string }) {
    return this.service.update(id, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Post(':id/stages')
  addStage(
    @Param('id') id: string,
    @Body() dto: { name: string; order?: number; isFinal?: boolean },
  ) {
    return this.service.addStage(id, dto);
  }

  @Get('stages/:stageId/usage')
  stageUsage(@Param('stageId') stageId: string) {
    return this.service.stageUsage(stageId);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Patch('stages/:stageId')
  updateStage(@Param('stageId') stageId: string, @Body() dto: { name?: string; isFinal?: boolean; color?: string }) {
    return this.service.updateStage(stageId, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Delete('stages/:stageId')
  removeStage(@Param('stageId') stageId: string, @Query('moveTo') moveTo?: string) {
    return this.service.removeStage(stageId, moveTo || undefined);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Post(':id/reorder')
  reorder(@Param('id') id: string, @Body() dto: { stageIds: string[] }) {
    return this.service.reorder(id, dto.stageIds || []);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Patch(':id/transitions')
  transitions(@Param('id') id: string, @Body() dto: { transitions: unknown }) {
    return this.service.setTransitions(id, dto.transitions);
  }
}

@Module({ controllers: [FunnelsController], providers: [FunnelsService], exports: [FunnelsService] })
export class FunnelsModule {}
