import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Module, Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class DemandsService {
  constructor(private prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; orgUnitId?: string }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where = query.orgUnitId ? { orgUnitId: query.orgUnitId } : {};
    const [items, total] = await Promise.all([
      this.prisma.demand.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          orgUnit: { select: { id: true, name: true, city: true } },
          candidateProfile: { select: { id: true, name: true } },
          _count: { select: { hiringRequests: true } },
        },
      }),
      this.prisma.demand.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async upsert(data: {
    orgUnitId: string;
    candidateProfileId: string;
    positionsCount: number;
    comment?: string;
    autoCreateRequest?: boolean;
  }) {
    const demand = await this.prisma.demand.upsert({
      where: {
        orgUnitId_candidateProfileId: {
          orgUnitId: data.orgUnitId,
          candidateProfileId: data.candidateProfileId,
        },
      },
      create: {
        orgUnitId: data.orgUnitId,
        candidateProfileId: data.candidateProfileId,
        positionsCount: data.positionsCount,
        comment: data.comment,
      },
      update: {
        positionsCount: data.positionsCount,
        comment: data.comment,
      },
      include: { orgUnit: true, candidateProfile: true },
    });

    if (data.autoCreateRequest !== false && data.positionsCount > 0) {
      const open = await this.prisma.hiringRequest.count({
        where: {
          demandId: demand.id,
          status: { notIn: ['CLOSED', 'CANCELLED', 'REJECTED_HR_BP'] },
        },
      });
      if (open === 0) {
        await this.prisma.hiringRequest.create({
          data: {
            title: `${demand.candidateProfile.name} — ${demand.orgUnit.name}`,
            orgUnitId: demand.orgUnitId,
            candidateProfileId: demand.candidateProfileId,
            demandId: demand.id,
            positionsCount: data.positionsCount,
            city: demand.orgUnit.city || undefined,
            status: 'NEW',
            statusHistory: {
              create: { toStatus: 'NEW', comment: 'Автосоздание из потребности' },
            },
          },
        });
      }
    }
    return demand;
  }

  async get(id: string) {
    const item = await this.prisma.demand.findUnique({
      where: { id },
      include: {
        orgUnit: true,
        candidateProfile: true,
        hiringRequests: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException();
    return item;
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.$transaction([
      this.prisma.hiringRequest.updateMany({ where: { demandId: id }, data: { demandId: null } }),
      this.prisma.demand.delete({ where: { id } }),
    ]);
    return { ok: true };
  }
}

class UpsertDemandDto {
  @IsUUID() orgUnitId!: string;
  @IsUUID() candidateProfileId!: string;
  @IsInt() @Min(0) positionsCount!: number;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() autoCreateRequest?: boolean;
}

@ApiTags('demands')
@ApiBearerAuth()
@Controller('demands')
export class DemandsController {
  constructor(private service: DemandsService) {}

  @Get()
  list(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('orgUnitId') orgUnitId?: string) {
    return this.service.list({ page, pageSize, orgUnitId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD)
  @Post()
  upsert(@Body() dto: UpsertDemandDto) {
    return this.service.upsert(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD)
  @Patch(':id')
  async patch(@Param('id') id: string, @Body() dto: { positionsCount?: number; comment?: string }) {
    const current = await this.service.get(id);
    const positionsCount = dto.positionsCount !== undefined ? Number(dto.positionsCount) : current.positionsCount;
    if (!Number.isInteger(positionsCount) || positionsCount < 0) throw new BadRequestException('Количество позиций должно быть целым числом от 0');
    return this.service.upsert({
      orgUnitId: current.orgUnitId,
      candidateProfileId: current.candidateProfileId,
      positionsCount,
      comment: dto.comment !== undefined ? dto.comment : current.comment ?? undefined,
      autoCreateRequest: false,
    });
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({ controllers: [DemandsController], providers: [DemandsService], exports: [DemandsService] })
export class DemandsModule {}
