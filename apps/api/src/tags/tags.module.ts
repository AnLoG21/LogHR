import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.tagCategory.findMany({
      include: { tags: { where: { isArchived: false } } },
    });
  }

  createTag(categoryId: string, name: string) {
    return this.prisma.tag.create({ data: { categoryId, name } });
  }
}

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private service: TagsService) {}
  @Get() list() { return this.service.list(); }
  @Roles(SystemRole.ADMIN)
  @Post()
  create(@Body() dto: { categoryId: string; name: string }) {
    return this.service.createTag(dto.categoryId, dto.name);
  }
}

@Module({ controllers: [TagsController], providers: [TagsService], exports: [TagsService] })
export class TagsModule {}
