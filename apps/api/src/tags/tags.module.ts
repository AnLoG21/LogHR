import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

function cleanName(name: unknown, what: string) {
  const v = String(name ?? '').trim();
  if (!v) throw new BadRequestException(`Укажите название ${what}`);
  return v;
}

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.tagCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        tags: {
          where: { isArchived: false },
          orderBy: { name: 'asc' },
          include: { _count: { select: { candidates: true } } },
        },
      },
    });
  }

  createTag(categoryId: string, name: string) {
    if (!categoryId) throw new BadRequestException('Выберите категорию');
    return this.prisma.tag.create({ data: { categoryId, name: cleanName(name, 'тега') } });
  }

  updateTag(id: string, data: { name?: string; categoryId?: string }) {
    const patch: any = {};
    if (data.name !== undefined) patch.name = cleanName(data.name, 'тега');
    if (data.categoryId) patch.categoryId = data.categoryId;
    return this.prisma.tag.update({ where: { id }, data: patch });
  }

  async archiveTag(id: string) {
    await this.prisma.candidateTag.deleteMany({ where: { tagId: id } });
    return this.prisma.tag.update({ where: { id }, data: { isArchived: true } });
  }

  createCategory(data: { name: string; allowMultiple?: boolean }) {
    return this.prisma.tagCategory.create({
      data: { name: cleanName(data.name, 'категории'), allowMultiple: data.allowMultiple ?? true },
    });
  }

  updateCategory(id: string, data: { name?: string; allowMultiple?: boolean }) {
    const patch: any = {};
    if (data.name !== undefined) patch.name = cleanName(data.name, 'категории');
    if (data.allowMultiple !== undefined) patch.allowMultiple = !!data.allowMultiple;
    return this.prisma.tagCategory.update({ where: { id }, data: patch });
  }

  async removeCategory(id: string) {
    const used = await this.prisma.candidateTag.count({ where: { tag: { categoryId: id } } });
    if (used) {
      throw new BadRequestException(`Теги этой категории назначены кандидатам (${used}). Сначала удалите или перенесите теги.`);
    }
    return this.prisma.tagCategory.delete({ where: { id } });
  }
}

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private service: TagsService) {}

  @Get() list() { return this.service.list(); }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Post()
  create(@Body() dto: { categoryId: string; name: string }) {
    return this.service.createTag(dto.categoryId, dto.name);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { name?: string; categoryId?: string }) {
    return this.service.updateTag(id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.archiveTag(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Post('categories')
  createCategory(@Body() dto: { name: string; allowMultiple?: boolean }) {
    return this.service.createCategory(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: { name?: string; allowMultiple?: boolean }) {
    return this.service.updateCategory(id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Delete('categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.service.removeCategory(id);
  }
}

@Module({ controllers: [TagsController], providers: [TagsService], exports: [TagsService] })
export class TagsModule {}
