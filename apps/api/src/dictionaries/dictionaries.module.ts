import { Body, Controller, Get, Injectable, Module, Post, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

@Injectable()
export class DictionariesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.dictionary.findMany({
      include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  addItem(dictionaryId: string, value: string, label: string) {
    return this.prisma.dictionaryItem.create({
      data: { dictionaryId, value, label },
    });
  }
}

@ApiTags('dictionaries')
@ApiBearerAuth()
@Controller('dictionaries')
export class DictionariesController {
  constructor(private service: DictionariesService) {}
  @Get() list() { return this.service.list(); }
  @Roles(SystemRole.ADMIN)
  @Post(':id/items')
  add(@Param('id') id: string, @Body() dto: { value: string; label: string }) {
    return this.service.addItem(id, dto.value, dto.label);
  }
}

@Module({ controllers: [DictionariesController], providers: [DictionariesService], exports: [DictionariesService] })
export class DictionariesModule {}
