import { Body, Controller, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
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

  assignUser(userId: string, visibilityProfileId: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { visibilityProfileId },
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
  @Post('assign')
  assign(@Body() dto: { userId: string; visibilityProfileId: string | null }) {
    return this.service.assignUser(dto.userId, dto.visibilityProfileId);
  }
}

@Module({ controllers: [VisibilityController], providers: [VisibilityService], exports: [VisibilityService] })
export class VisibilityModule {}
