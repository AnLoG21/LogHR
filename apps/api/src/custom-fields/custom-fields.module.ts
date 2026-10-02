import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

@Injectable()
export class CustomFieldsService {
  constructor(private prisma: PrismaService) {}

  list(entityType?: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  create(data: {
    entityType: string;
    code: string;
    label: string;
    fieldType?: string;
    options?: unknown;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.prisma.customFieldDefinition.create({
      data: {
        entityType: data.entityType,
        code: data.code,
        label: data.label,
        fieldType: data.fieldType || 'string',
        options: (data.options ?? undefined) as Prisma.InputJsonValue | undefined,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{ label: string; fieldType: string; options: unknown; sortOrder: number; isActive: boolean }>,
  ) {
    const existing = await this.prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(data.label != null ? { label: data.label } : {}),
        ...(data.fieldType != null ? { fieldType: data.fieldType } : {}),
        ...(data.options !== undefined ? { options: data.options as Prisma.InputJsonValue } : {}),
        ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.customFieldDefinition.delete({ where: { id } });
    return { ok: true };
  }
}

@ApiTags('custom-fields')
@ApiBearerAuth()
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private service: CustomFieldsService) {}

  @Get()
  list(@Query('entityType') entityType?: string) {
    return this.service.list(entityType);
  }

  @Roles(SystemRole.ADMIN)
  @Post()
  create(
    @Body()
    dto: {
      entityType: string;
      code: string;
      label: string;
      fieldType?: string;
      options?: unknown;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.service.create(dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<{ label: string; fieldType: string; options: unknown; sortOrder: number; isActive: boolean }>,
  ) {
    return this.service.update(id, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ controllers: [CustomFieldsController], providers: [CustomFieldsService], exports: [CustomFieldsService] })
export class CustomFieldsModule {}
