import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

function required(v: unknown, msg: string) {
  const s = String(v ?? '').trim();
  if (!s) throw new BadRequestException(msg);
  return s;
}

@Injectable()
export class DictionariesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.dictionary.findMany({
      include: { items: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
      orderBy: { name: 'asc' },
    });
  }

  createDictionary(data: { name: string; code: string }) {
    return this.prisma.dictionary.create({
      data: { name: required(data.name, 'Укажите название справочника'), code: required(data.code, 'Нет кода справочника') },
    });
  }

  renameDictionary(id: string, name: string) {
    return this.prisma.dictionary.update({ where: { id }, data: { name: required(name, 'Укажите название справочника') } });
  }

  removeDictionary(id: string) {
    return this.prisma.dictionary.delete({ where: { id } });
  }

  async addItem(dictionaryId: string, value: string, label: string) {
    const max = await this.prisma.dictionaryItem.aggregate({ where: { dictionaryId }, _max: { sortOrder: true } });
    return this.prisma.dictionaryItem.create({
      data: {
        dictionaryId,
        value: required(value, 'Нет кода значения'),
        label: required(label, 'Укажите значение'),
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
  }

  updateItem(id: string, data: { label?: string; sortOrder?: number }) {
    const patch: any = {};
    if (data.label !== undefined) patch.label = required(data.label, 'Укажите значение');
    if (data.sortOrder !== undefined) patch.sortOrder = Number(data.sortOrder) || 0;
    return this.prisma.dictionaryItem.update({ where: { id }, data: patch });
  }

  removeItem(id: string) {
    return this.prisma.dictionaryItem.update({ where: { id }, data: { isActive: false } });
  }
}

@ApiTags('dictionaries')
@ApiBearerAuth()
@Controller('dictionaries')
export class DictionariesController {
  constructor(private service: DictionariesService) {}

  @Get() list() { return this.service.list(); }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Post()
  create(@Body() dto: { name: string; code: string }) {
    return this.service.createDictionary(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Patch('items/:itemId')
  updateItem(@Param('itemId') itemId: string, @Body() dto: { label?: string; sortOrder?: number }) {
    return this.service.updateItem(itemId, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Delete('items/:itemId')
  removeItem(@Param('itemId') itemId: string) {
    return this.service.removeItem(itemId);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Patch(':id')
  rename(@Param('id') id: string, @Body() dto: { name: string }) {
    return this.service.renameDictionary(id, dto.name);
  }

  @Roles(SystemRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.removeDictionary(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Post(':id/items')
  add(@Param('id') id: string, @Body() dto: { value: string; label: string }) {
    return this.service.addItem(id, dto.value, dto.label);
  }
}

@Module({ controllers: [DictionariesController], providers: [DictionariesService], exports: [DictionariesService] })
export class DictionariesModule {}
