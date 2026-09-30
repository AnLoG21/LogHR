import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, SystemRole } from '@prisma/client';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';
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
}

@Module({ controllers: [VacanciesController], providers: [VacanciesService], exports: [VacanciesService] })
export class VacanciesModule {}
