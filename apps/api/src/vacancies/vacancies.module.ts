import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, SystemRole } from '@prisma/client';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class VacanciesService {
  constructor(private prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; search?: string; isActive?: boolean; topLevel?: boolean }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where: Prisma.VacancyWhereInput = {
      AND: [
        query.search ? { title: { contains: query.search } } : {},
        query.isActive === undefined ? {} : { isActive: query.isActive },
        query.topLevel ? { parentId: null } : {},
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
          parent: { select: { id: true, title: true } },
          children: {
            select: { id: true, city: true, isActive: true, _count: { select: { candidates: true } } },
            orderBy: { city: 'asc' },
          },
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
        parent: { select: { id: true, title: true, city: true } },
        children: {
          include: {
            _count: { select: { candidates: true, publications: true } },
            publications: { select: { id: true, board: true, status: true, url: true }, orderBy: { createdAt: 'desc' } },
          },
          orderBy: { city: 'asc' },
        },
      },
    });
    if (!item) throw new NotFoundException();

    const vacancyIds = [id, ...item.children.map((c) => c.id)];
    const [candidates, stageCounters] = await Promise.all([
      this.prisma.candidate.findMany({
        where: { vacancyId: { in: vacancyIds } },
        include: { stage: true, vacancy: { select: { id: true, city: true } } },
        orderBy: { stageChangedAt: 'desc' },
        take: 200,
      }),
      this.prisma.candidate.groupBy({
        by: ['stageId'],
        where: { vacancyId: { in: vacancyIds } },
        _count: true,
      }),
    ]);
    return { ...item, candidates, stageCounters };
  }

  /** Adds per-city child vacancies that share the master's funnel and profile. */
  async addCities(id: string, cities: string[]) {
    const master = await this.prisma.vacancy.findUnique({ where: { id }, include: { children: true } });
    if (!master) throw new NotFoundException();
    if (master.parentId) throw new BadRequestException('Города добавляются только к мастер-вакансии');
    const existing = new Set(
      [master.city, ...master.children.map((c) => c.city)].filter(Boolean).map((c) => c!.trim().toLowerCase()),
    );
    const toCreate = [...new Set(cities.map((c) => c.trim()).filter(Boolean))]
      .filter((c) => !existing.has(c.toLowerCase()));
    if (!toCreate.length) throw new BadRequestException('Эти города уже есть');
    await this.prisma.vacancy.createMany({
      data: toCreate.map((city) => ({
        title: master.title,
        description: master.description,
        city,
        isActive: master.isActive,
        isPublicApply: master.isPublicApply,
        orgUnitId: master.orgUnitId,
        candidateProfileId: master.candidateProfileId,
        funnelId: master.funnelId,
        parentId: master.id,
      })),
    });
    return this.get(id);
  }

  async getPublic(id: string) {
    const item = await this.prisma.vacancy.findFirst({
      where: { id, isActive: true, isPublicApply: true },
      select: {
        id: true,
        title: true,
        description: true,
        city: true,
        candidateProfile: { select: { name: true, description: true } },
        orgUnit: { select: { name: true, city: true } },
      },
    });
    if (!item) throw new NotFoundException('Вакансия недоступна для отклика');
    const branding = await this.prisma.branding.findFirst();
    return { ...item, branding: branding ? { companyName: branding.companyName, primaryColor: branding.primaryColor } : null };
  }

  async publicApply(
    id: string,
    data: {
      firstName: string;
      lastName: string;
      middleName?: string;
      phone?: string;
      email?: string;
      city?: string;
      address?: string;
      about?: string;
      pdnConsent?: boolean;
    },
  ) {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: { id, isActive: true, isPublicApply: true },
      include: { funnel: { include: { stages: { orderBy: { order: 'asc' }, take: 1 } } } },
    });
    if (!vacancy) throw new NotFoundException('Вакансия недоступна для отклика');
    if (!data.firstName?.trim() || !data.lastName?.trim()) {
      throw new BadRequestException('Укажите имя и фамилию');
    }
    if (!data.pdnConsent) {
      throw new BadRequestException('Нужно согласие на обработку ПДн');
    }

    const stageId = vacancy.funnel.stages[0]?.id;
    const candidate = await this.prisma.candidate.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        middleName: data.middleName?.trim() || undefined,
        phone: data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
        city: data.city?.trim() || vacancy.city || undefined,
        address: data.address?.trim() || undefined,
        about: data.about?.trim() || undefined,
        source: 'CAREER_SITE',
        addType: 'RESPONSE',
        vacancyId: vacancy.id,
        stageId,
        stageChangedAt: stageId ? new Date() : undefined,
        pdnConsentAt: new Date(),
        consentType: 'PUBLIC_APPLY',
        statusHistory: stageId
          ? { create: { stageId, comment: 'Отклик с карьерной формы' } }
          : undefined,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    return { ok: true, candidateId: candidate.id, message: 'Отклик принят' };
  }

  async create(data: {
    title: string;
    candidateProfileId: string;
    funnelId: string;
    orgUnitId?: string;
    city?: string;
    description?: string;
    hiringRequestIds?: string[];
    isPublicApply?: boolean;
  }) {
    const vacancy = await this.prisma.vacancy.create({
      data: {
        title: data.title,
        candidateProfileId: data.candidateProfileId,
        funnelId: data.funnelId,
        orgUnitId: data.orgUnitId,
        city: data.city,
        description: data.description,
        isPublicApply: data.isPublicApply ?? false,
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
    isPublicApply: boolean;
    funnelId: string;
    extra: Record<string, unknown>;
  }>) {
    const exists = await this.prisma.vacancy.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    if (exists.parentId && data.funnelId != null && data.funnelId !== exists.funnelId) {
      throw new BadRequestException('Воронка наследуется от мастер-вакансии');
    }
    if (!exists.parentId) {
      const inherited: Prisma.VacancyUpdateManyMutationInput = {
        ...(data.funnelId != null ? { funnelId: data.funnelId } : {}),
        ...(data.description != null ? { description: data.description } : {}),
      };
      if (Object.keys(inherited).length) {
        await this.prisma.vacancy.updateMany({ where: { parentId: id }, data: inherited });
      }
      if (data.title != null && data.title !== exists.title) {
        await this.prisma.vacancy.updateMany({ where: { parentId: id, title: exists.title }, data: { title: data.title } });
      }
    }
    await this.prisma.vacancy.update({
      where: { id },
      data: {
        ...(data.title != null ? { title: data.title } : {}),
        ...(data.description != null ? { description: data.description } : {}),
        ...(data.city != null ? { city: data.city } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
        ...(data.isPublicApply != null ? { isPublicApply: data.isPublicApply } : {}),
        ...(data.funnelId != null ? { funnelId: data.funnelId } : {}),
        ...(data.extra != null ? { extra: data.extra as Prisma.InputJsonValue } : {}),
      },
    });
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
  @IsOptional() @IsBoolean() isPublicApply?: boolean;
}

class AddCitiesDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(50) @IsString({ each: true }) cities!: string[];
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
    @Query('topLevel') topLevel?: string,
  ) {
    return this.service.list({
      page,
      pageSize,
      search,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      topLevel: topLevel === 'true',
    });
  }

  @Public()
  @Get('public/:id')
  getPublic(@Param('id') id: string) {
    return this.service.getPublic(id);
  }

  @Public()
  @Post('public/:id/apply')
  publicApply(
    @Param('id') id: string,
    @Body()
    dto: {
      firstName: string;
      lastName: string;
      middleName?: string;
      phone?: string;
      email?: string;
      city?: string;
      address?: string;
      about?: string;
      pdnConsent?: boolean;
    },
  ) {
    return this.service.publicApply(id, dto);
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
  update(@Param('id') id: string, @Body() dto: Partial<CreateVacancyDto> & { isActive?: boolean; extra?: Record<string, unknown> }) {
    return this.service.update(id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD, SystemRole.RECRUITER)
  @Post(':id/cities')
  addCities(@Param('id') id: string, @Body() dto: AddCitiesDto) {
    return this.service.addCities(id, dto.cities);
  }
}

@Module({ controllers: [VacanciesController], providers: [VacanciesService], exports: [VacanciesService] })
export class VacanciesModule {}
