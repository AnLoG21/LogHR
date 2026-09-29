import { Body, Controller, Get, Param, Patch, Post, Query, Module, Injectable, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; search?: string }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where = {
      isActive: true,
      ...(query.search
        ? { name: { contains: query.search } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.candidateProfile.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.candidateProfile.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  create(data: { name: string; description?: string; department?: string; grade?: string }) {
    return this.prisma.candidateProfile.create({ data });
  }

  async update(id: string, data: any) {
    const exists = await this.prisma.candidateProfile.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    return this.prisma.candidateProfile.update({ where: { id }, data });
  }
}

class CreateProfileDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() grade?: string;
}

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private service: ProfilesService) {}

  @Get()
  list(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('search') search?: string) {
    return this.service.list({ page, pageSize, search });
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD)
  @Post()
  create(@Body() dto: CreateProfileDto) {
    return this.service.create(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateProfileDto> & { isActive?: boolean }) {
    return this.service.update(id, dto);
  }
}

@Module({ controllers: [ProfilesController], providers: [ProfilesService], exports: [ProfilesService] })
export class ProfilesModule {}
