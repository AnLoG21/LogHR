import {
  BadRequestException, Body, Controller, Get, Module, Injectable, NotFoundException, Param, Post, Patch,
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

  async addStage(funnelId: string, data: { name: string; code: string; order?: number; isFinal?: boolean }) {
    const max = await this.prisma.funnelStage.aggregate({
      where: { funnelId },
      _max: { order: true },
    });
    return this.prisma.funnelStage.create({
      data: {
        funnelId,
        name: data.name,
        code: data.code,
        order: data.order ?? (max._max.order ?? 0) + 1,
        isFinal: !!data.isFinal,
      },
    });
  }

  async updateStage(
    id: string,
    data: Partial<{ name: string; code: string; order: number; isFinal: boolean; color: string }>,
  ) {
    return this.prisma.funnelStage.update({ where: { id }, data });
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
  @Post(':id/stages')
  addStage(
    @Param('id') id: string,
    @Body() dto: { name: string; code: string; order?: number; isFinal?: boolean },
  ) {
    return this.service.addStage(id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD)
  @Patch('stages/:stageId')
  updateStage(@Param('stageId') stageId: string, @Body() dto: any) {
    return this.service.updateStage(stageId, dto);
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
