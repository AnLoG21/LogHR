import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

@Injectable()
export class VisibilityService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.visibilityProfile.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  get(id: string) {
    return this.prisma.visibilityProfile.findUnique({
      where: { id },
      include: { users: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
    });
  }

  create(data: { name: string; code: string; rules?: any }) {
    return this.prisma.visibilityProfile.create({
      data: { name: data.name, code: data.code, rules: data.rules || {} },
    });
  }

  update(id: string, data: Partial<{ name: string; rules: any }>) {
    return this.prisma.visibilityProfile.update({ where: { id }, data });
  }

  async remove(id: string) {
    const existing = await this.prisma.visibilityProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { visibilityProfileId: id }, data: { visibilityProfileId: null } }),
      this.prisma.visibilityProfile.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  assignUser(userId: string, visibilityProfileId: string | null) {
    if (!userId) throw new BadRequestException('Не выбран пользователь');
    return this.prisma.user.update({
      where: { id: userId },
      data: { visibilityProfileId: visibilityProfileId || null },
      select: { id: true, email: true, visibilityProfileId: true },
    });
  }
}

@ApiTags('visibility')
@ApiBearerAuth()
@Controller('visibility')
export class VisibilityController {
  constructor(private service: VisibilityService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Roles(SystemRole.ADMIN)
  @Post()
  create(@Body() dto: { name: string; code: string; rules?: any }) {
    return this.service.create(dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<{ name: string; rules: any }>) {
    return this.service.update(id, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles(SystemRole.ADMIN)
  @Post('assign')
  assign(@Body() dto: { userId: string; visibilityProfileId: string | null }) {
    return this.service.assignUser(dto.userId, dto.visibilityProfileId);
  }
}

@Module({ controllers: [VisibilityController], providers: [VisibilityService], exports: [VisibilityService] })
export class VisibilityModule {}
