import { Body, Controller, Get, Module, Injectable, Param, Post, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
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

  async setTransitions(funnelId: string, transitions: any) {
    return this.prisma.funnel.update({
      where: { id: funnelId },
      data: { transitions },
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
  transitions(@Param('id') id: string, @Body() dto: { transitions: any }) {
    return this.service.setTransitions(id, dto.transitions);
  }
}

@Module({ controllers: [FunnelsController], providers: [FunnelsService], exports: [FunnelsService] })
export class FunnelsModule {}
