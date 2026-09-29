import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Post, Put, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/guards';

@Injectable()
export class FiltersService {
  constructor(private prisma: PrismaService) {}

  list(userId: string, entity?: string) {
    return this.prisma.savedFilter.findMany({
      where: { userId, ...(entity ? { entity } : {}) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  create(userId: string, data: { name: string; entity?: string; payload: any; isDefault?: boolean }) {
    return this.prisma.savedFilter.create({
      data: {
        userId,
        name: data.name,
        entity: data.entity || 'candidates',
        payload: data.payload,
        isDefault: !!data.isDefault,
      },
    });
  }

  update(id: string, userId: string, data: Partial<{ name: string; payload: any; isDefault: boolean }>) {
    return this.prisma.savedFilter.updateMany({
      where: { id, userId },
      data,
    }).then(() => this.prisma.savedFilter.findFirst({ where: { id, userId } }));
  }

  remove(id: string, userId: string) {
    return this.prisma.savedFilter.deleteMany({ where: { id, userId } });
  }
}

@ApiTags('filters')
@ApiBearerAuth()
@Controller('filters')
export class FiltersController {
  constructor(private service: FiltersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('entity') entity?: string) {
    return this.service.list(user.id, entity);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: { name: string; entity?: string; payload: any; isDefault?: boolean },
  ) {
    return this.service.create(user.id, dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: Partial<{ name: string; payload: any; isDefault: boolean }>,
  ) {
    return this.service.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.id);
  }
}

@Module({ controllers: [FiltersController], providers: [FiltersService], exports: [FiltersService] })
export class FiltersModule {}
