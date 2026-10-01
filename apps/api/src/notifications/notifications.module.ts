import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import { assertCanMoveToStage } from '../funnels/transitions';
import { createSmsAdapter, SmsPort } from './sms.adapter';

@Injectable()
export class NotificationsService {
  private sms: SmsPort = createSmsAdapter();

  constructor(private prisma: PrismaService) {}

  listTemplates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: { code: 'asc' } });
  }

  updateTemplate(id: string, data: { subject?: string; body?: string; isActive?: boolean }) {
    return this.prisma.notificationTemplate.update({ where: { id }, data });
  }

  private async mailer() {
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    return nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  render(template: string, vars: Record<string, string>) {
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
      template,
    );
  }

  async sendEmail(to: string, templateCode: string, vars: Record<string, string> = {}) {
    const tpl = await this.prisma.notificationTemplate.findUnique({ where: { code: templateCode } });
    if (!tpl || !tpl.isActive) {
      await this.prisma.notificationLog.create({
        data: { channel: 'EMAIL', to, subject: templateCode, body: 'template missing', status: 'SKIPPED' },
      });
      return { ok: false, reason: 'template_missing' };
    }
    const subject = this.render(tpl.subject, vars);
    const body = this.render(tpl.body, vars);
    const transporter = await this.mailer();
    try {
      if (transporter) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@loghr.local',
          to,
          subject,
          html: body,
        });
      } else {
        console.log(`[EMAIL mock] to=${to} subject=${subject}`);
      }
      await this.prisma.notificationLog.create({
        data: { channel: 'EMAIL', to, subject, body, status: transporter ? 'SENT' : 'MOCKED' },
      });
      return { ok: true };
    } catch (e: any) {
      await this.prisma.notificationLog.create({
        data: { channel: 'EMAIL', to, subject, body, status: 'FAILED', error: e?.message },
      });
      return { ok: false, error: e?.message };
    }
  }

  async sendSms(to: string, text: string) {
    const result = await this.sms.send(to, text);
    await this.prisma.notificationLog.create({
      data: {
        channel: 'SMS',
        to,
        body: text,
        status: result.ok ? 'SENT' : 'FAILED',
      },
    });
    return result;
  }

  async sendBulk(user: { id: string; role: string }, opts: {
    candidateIds: string[];
    templateCode: string;
    stageId?: string;
    vars?: Record<string, string>;
    comment?: string;
  }) {
    const ids = Array.from(new Set(opts.candidateIds || [])).filter(Boolean).slice(0, 100);
    const stage = opts.stageId
      ? await this.prisma.funnelStage.findUnique({ where: { id: opts.stageId }, include: { funnel: true } })
      : null;
    if (opts.stageId && !stage) throw new BadRequestException('Этап не найден');
    if (stage) assertCanMoveToStage(stage.funnel.transitions, stage, user.role);
    const results: Array<{ id: string; ok: boolean; reason?: string; email?: string }> = [];
    for (const id of ids) {
      const c = await this.prisma.candidate.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          vacancy: { select: { title: true, funnelId: true } },
        },
      });
      if (!c) {
        results.push({ id, ok: false, reason: 'not_found' });
        continue;
      }
      if (!c.email) {
        results.push({ id, ok: false, reason: 'no_email' });
        continue;
      }
      const vars = {
        name: `${c.firstName} ${c.lastName}`.trim(),
        firstName: c.firstName,
        lastName: c.lastName,
        vacancy: c.vacancy?.title || '',
        phone: c.phone || '',
        datetime: opts.vars?.datetime || '',
        ...(opts.vars || {}),
      };
      const sent = await this.sendEmail(c.email, opts.templateCode, vars);
      if (stage && c.vacancy?.funnelId === stage.funnelId) {
        await this.prisma.candidate.update({
          where: { id },
          data: {
            stageId: stage.id,
            stageChangedAt: new Date(),
            statusHistory: {
              create: {
                stageId: stage.id,
                changedById: user.id,
                comment: opts.comment || `Массовая рассылка: ${opts.templateCode}`,
              },
            },
          },
        });
      } else if (opts.comment) {
        await this.prisma.comment.create({
          data: { candidateId: id, body: opts.comment },
        });
      }
      results.push({ id, ok: !!sent.ok, reason: (sent as any).reason || (sent as any).error, email: c.email });
    }
    return {
      total: ids.length,
      sent: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /** Russian numbers to wa.me format: 8XXXXXXXXXX / XXXXXXXXXX → 7XXXXXXXXXX. */
  normalizePhone(phone?: string | null) {
    let digits = (phone || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits.length === 10) digits = `7${digits}`;
    return digits.length >= 11 && digits.length <= 15 ? digits : null;
  }

  /**
   * WhatsApp has no free sending API, so the recruiter sends via a wa.me deep link;
   * dryRun renders the text, otherwise the send is logged on the candidate.
   */
  async whatsapp(
    user: { id: string; firstName?: string; lastName?: string },
    dto: { candidateId: string; templateCode?: string; text?: string; vars?: Record<string, string>; dryRun?: boolean },
  ) {
    const c = await this.prisma.candidate.findUnique({
      where: { id: dto.candidateId },
      select: {
        id: true, firstName: true, lastName: true, middleName: true, phone: true, city: true,
        meetingAt: true, vacancy: { select: { title: true, city: true } },
      },
    });
    if (!c) throw new NotFoundException('Кандидат не найден');
    const phone = this.normalizePhone(c.phone);
    if (!phone) throw new BadRequestException('У кандидата нет корректного номера телефона');

    let text = dto.text?.trim() || '';
    if (!text) {
      if (!dto.templateCode) throw new BadRequestException('Укажите шаблон или текст');
      const tpl = await this.prisma.notificationTemplate.findUnique({ where: { code: dto.templateCode } });
      if (!tpl || !tpl.isActive) throw new NotFoundException('Шаблон не найден');
      const branding = await this.prisma.branding.findFirst();
      text = this.render(tpl.body, {
        name: [c.firstName, c.middleName].filter(Boolean).join(' '),
        firstName: c.firstName,
        lastName: c.lastName,
        vacancy: c.vacancy?.title || '',
        city: c.vacancy?.city || c.city || '',
        datetime: c.meetingAt
          ? c.meetingAt.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow' })
          : '',
        recruiter: [user.firstName, user.lastName].filter(Boolean).join(' '),
        company: branding?.companyName || '',
        ...(dto.vars || {}),
      });
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    if (!dto.dryRun) {
      await this.prisma.notificationLog.create({
        data: { channel: 'WHATSAPP', to: phone, subject: dto.templateCode || null, body: text, status: 'OPENED' },
      });
      await this.prisma.comment.create({
        data: { candidateId: c.id, authorId: user.id, body: `WhatsApp: ${text}` },
      });
    }
    return { phone, text, url };
  }

  logs() {
    return this.prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}

class WhatsappDto {
  @IsUUID() candidateId!: string;
  @IsOptional() @IsString() templateCode?: string;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @IsOptional() @IsObject() vars?: Record<string, string>;
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get('templates')
  templates() { return this.service.listTemplates(); }

  @Roles(SystemRole.ADMIN)
  @Patch('templates/:id')
  update(@Param('id') id: string, @Body() dto: { subject?: string; body?: string; isActive?: boolean }) {
    return this.service.updateTemplate(id, dto);
  }

  @Post('email')
  email(@Body() dto: { to: string; templateCode: string; vars?: Record<string, string> }) {
    return this.service.sendEmail(dto.to, dto.templateCode, dto.vars || {});
  }

  @Post('bulk')
  bulk(
    @CurrentUser() user: any,
    @Body()
    dto: {
      candidateIds: string[];
      templateCode: string;
      stageId?: string;
      vars?: Record<string, string>;
      comment?: string;
    },
  ) {
    return this.service.sendBulk(user, dto);
  }

  @Post('whatsapp')
  whatsapp(@CurrentUser() user: any, @Body() dto: WhatsappDto) {
    return this.service.whatsapp(user, dto);
  }

  @Post('sms')
  sms(@Body() dto: { to: string; text: string }) {
    return this.service.sendSms(dto.to, dto.text);
  }

  @Get('logs')
  logs() {
    return this.service.logs();
  }
}

@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
