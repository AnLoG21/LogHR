import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, SystemRole } from '@prisma/client';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class VacanciesService {
  constructor(private prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; search?: string; isActive?: boolean }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where: Prisma.VacancyWhereInput = {
      AND: [
        query.search ? { title: { contains: query.search } } : {},
        query.isActive === undefined ? {} : { isActive: query.isActive },
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.vacancy.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          candidateProfile: { select: { id: true, name: true } },
          orgUnit: { select: { id: true, name: true } },
          funnel: { include: { stages: { orderBy: { order: 'asc' } } } },
          _count: { select: { candidates: true, hiringRequests: true, publications: true } },
        },
      }),
      this.prisma.vacancy.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async get(id: string) {
    const item = await this.prisma.vacancy.findUnique({
      where: { id },
      include: {
        candidateProfile: true,
        orgUnit: true,
        funnel: { include: { stages: { orderBy: { order: 'asc' } } } },
        hiringRequests: true,
        publications: { orderBy: { createdAt: 'desc' } },
        candidates: {
          include: { stage: true },
          orderBy: { stageChangedAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!item) throw new NotFoundException();

    const stageCounters = await this.prisma.candidate.groupBy({
      by: ['stageId'],
      where: { vacancyId: id },
      _count: true,
    });
    return { ...item, stageCounters };
  }

  async create(data: {
    title: string;
    candidateProfileId: string;
    funnelId: string;
    orgUnitId?: string;
    city?: string;
    description?: string;
    hiringRequestIds?: string[];
  }) {
    const vacancy = await this.prisma.vacancy.create({
      data: {
        title: data.title,
        candidateProfileId: data.candidateProfileId,
        funnelId: data.funnelId,
        orgUnitId: data.orgUnitId,
        city: data.city,
        description: data.description,
      },
    });
    if (data.hiringRequestIds?.length) {
      await this.prisma.hiringRequest.updateMany({
        where: { id: { in: data.hiringRequestIds } },
        data: { vacancyId: vacancy.id },
      });
    }
    return this.get(vacancy.id);
  }

  async update(id: string, data: Partial<{
    title: string;
    description: string;
    city: string;
    isActive: boolean;
    funnelId: string;
  }>) {
    const exists = await this.prisma.vacancy.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    await this.prisma.vacancy.update({ where: { id }, data });
    return this.get(id);
  }
}

class CreateVacancyDto {
  @IsString() title!: string;
  @IsUUID() candidateProfileId!: string;
  @IsUUID() funnelId!: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() hiringRequestIds?: string[];
}

@ApiTags('vacancies')
@ApiBearerAuth()
@Controller('vacancies')
export class VacanciesController {
  constructor(private service: VacanciesService) {}

  @Get()
  list(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.list({
      page,
      pageSize,
      search,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD, SystemRole.RECRUITER)
  @Post()
  create(@Body() dto: CreateVacancyDto) {
    return this.service.create(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD, SystemRole.RECRUITER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateVacancyDto> & { isActive?: boolean }) {
    return this.service.update(id, dto);
  }
}

@Module({ controllers: [VacanciesController], providers: [VacanciesService], exports: [VacanciesService] })
export class VacanciesModule {}
