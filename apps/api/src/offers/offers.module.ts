import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OfferStatus, Prisma, SystemRole } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import PDFDocument from 'pdfkit';
import { OFFER_STATUS_LABELS, ruLabel } from '@skillaz/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, Public, Roles } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';
import { visibilityWhere } from '../common/visibility';
import { AuditModule, AuditService } from '../audit/audit.module';

@Injectable()
export class OffersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(query: { page?: number; pageSize?: number; status?: OfferStatus }, user: AuthUser) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const candVis = visibilityWhere({
      id: user.id,
      role: user.role as any,
      orgUnitId: (user as any).orgUnitId,
      visibilityRules: (user as any).visibilityRules,
    });
    const where: Prisma.OfferWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      candidate: { isDepersonalized: false, AND: [candVis] },
    };
    const [items, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.offer.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async create(data: {
    candidateId: string;
    position?: string;
    salary?: number;
    currency?: string;
    startDate?: string;
    conditions?: string;
  }, user: AuthUser) {
    const { randomUUID } = await import('crypto');
    if (!data.candidateId) throw new BadRequestException('Не указан кандидат');
    const salary = data.salary != null && data.salary !== ('' as any) ? Number(data.salary) : undefined;
    if (salary !== undefined && (!Number.isFinite(salary) || salary < 0)) throw new BadRequestException('Некорректный оклад');
    const offer = await this.prisma.offer.create({
      data: {
        candidateId: data.candidateId,
        position: data.position?.trim() || undefined,
        salary,
        currency: data.currency || 'RUB',
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        conditions: data.conditions,
        createdById: user.id,
        externalToken: randomUUID(),
        status: 'DRAFT',
      },
    });
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'create',
      entity: 'Offer',
      entityId: offer.id,
      meta: { candidateId: data.candidateId },
    });
    return offer;
  }

  async update(id: string, data: { position?: string; salary?: number | null; startDate?: string | null; conditions?: string }) {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException();
    if (['ACCEPTED', 'DECLINED'].includes(offer.status)) {
      throw new BadRequestException('Кандидат уже ответил на оффер — изменить его нельзя');
    }
    const patch: any = {};
    if (data.position !== undefined) patch.position = data.position?.trim() || null;
    if (data.salary !== undefined) {
      const salary = data.salary === null || data.salary === ('' as any) ? null : Number(data.salary);
      if (salary !== null && (!Number.isFinite(salary) || salary < 0)) throw new BadRequestException('Некорректный оклад');
      patch.salary = salary;
    }
    if (data.startDate !== undefined) patch.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.conditions !== undefined) patch.conditions = data.conditions || null;
    return this.prisma.offer.update({ where: { id }, data: patch });
  }

  async remove(id: string, user: AuthUser) {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException();
    if (offer.status === 'ACCEPTED') throw new BadRequestException('Принятый оффер удалить нельзя');
    await this.prisma.offer.delete({ where: { id } });
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'delete',
      entity: 'Offer',
      entityId: id,
      meta: { candidateId: offer.candidateId, status: offer.status },
    });
    return { ok: true };
  }

  async changeStatus(id: string, status: OfferStatus, user: AuthUser) {
    if (!Object.values(OfferStatus).includes(status)) throw new BadRequestException('Неизвестный статус оффера');
    const updated = await this.prisma.offer.update({ where: { id }, data: { status } });
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'status_change',
      entity: 'Offer',
      entityId: id,
      meta: { status, candidateId: updated.candidateId },
    });
    return updated;
  }

  async getByToken(token: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { externalToken: token },
      include: { candidate: { select: { firstName: true, lastName: true } } },
    });
    if (!offer) throw new NotFoundException();
    return offer;
  }

  async respondByToken(token: string, accept: boolean) {
    const offer = await this.getByToken(token);
    return this.prisma.offer.update({
      where: { id: offer.id },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED' },
    });
  }

  async generatePdf(id: string): Promise<Buffer> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: { candidate: true },
    });
    if (!offer) throw new NotFoundException();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Предложение о работе (Offer)', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Кандидат: ${offer.candidate.lastName} ${offer.candidate.firstName}`);
      doc.text(`Должность: ${offer.position || '—'}`);
      doc.text(`Оклад: ${offer.salary ? `${offer.salary} ${offer.currency}` : '—'}`);
      doc.text(`Дата выхода: ${offer.startDate ? offer.startDate.toLocaleDateString('ru-RU') : '—'}`);
      doc.moveDown();
      doc.text('Условия:');
      doc.text(offer.conditions || '—');
      doc.moveDown();
      doc.text(`Статус: ${ruLabel(OFFER_STATUS_LABELS, offer.status)}`);
      doc.end();
    });
  }
}

@ApiTags('offers')
@Controller('offers')
export class OffersController {
  constructor(private service: OffersService) {}

  @ApiBearerAuth()
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: OfferStatus,
  ) {
    return this.service.list({ page, pageSize, status }, user);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD, SystemRole.HIRING_MANAGER)
  @Post()
  create(
    @Body() dto: { candidateId: string; position?: string; salary?: number; currency?: string; startDate?: string; conditions?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD, SystemRole.HIRING_MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { position?: string; salary?: number | null; startDate?: string | null; conditions?: string },
  ) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @ApiBearerAuth()
  @Post(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body('status') status: OfferStatus,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.changeStatus(id, status, user);
  }

  @ApiBearerAuth()
  @Get(':id/pdf')
  async pdf(@Param('id') id: string) {
    const buf = await this.service.generatePdf(id);
    return { contentType: 'application/pdf', base64: buf.toString('base64') };
  }

  @Public()
  @Get('public/:token')
  publicGet(@Param('token') token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post('public/:token/respond')
  publicRespond(@Param('token') token: string, @Body('accept') accept: boolean) {
    return this.service.respondByToken(token, !!accept);
  }
}

@Module({
  imports: [AuditModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
