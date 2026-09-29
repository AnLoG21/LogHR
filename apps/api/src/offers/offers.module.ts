import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OfferStatus, SystemRole } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, Public, Roles } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class OffersService {
  constructor(private prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; status?: OfferStatus }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where = query.status ? { status: query.status } : {};
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
    return this.prisma.offer.create({
      data: {
        candidateId: data.candidateId,
        position: data.position,
        salary: data.salary,
        currency: data.currency || 'RUB',
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        conditions: data.conditions,
        createdById: user.id,
        externalToken: randomUUID(),
        status: 'DRAFT',
      },
    });
  }

  async changeStatus(id: string, status: OfferStatus) {
    return this.prisma.offer.update({ where: { id }, data: { status } });
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
      doc.text(`Статус: ${offer.status}`);
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
  list(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('status') status?: OfferStatus) {
    return this.service.list({ page, pageSize, status });
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
  @Post(':id/status')
  changeStatus(@Param('id') id: string, @Body('status') status: OfferStatus) {
    return this.service.changeStatus(id, status);
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

@Module({ controllers: [OffersController], providers: [OffersService], exports: [OffersService] })
export class OffersModule {}
