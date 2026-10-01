import { Body, Controller, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';
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

  async sendBulk(opts: {
    candidateIds: string[];
    templateCode: string;
    stageId?: string;
    vars?: Record<string, string>;
    comment?: string;
  }) {
    const ids = Array.from(new Set(opts.candidateIds || [])).filter(Boolean).slice(0, 100);
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
          vacancy: { select: { title: true } },
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
      if (opts.stageId) {
        await this.prisma.candidate.update({
          where: { id },
          data: {
            stageId: opts.stageId,
            stageChangedAt: new Date(),
            statusHistory: {
              create: {
                stageId: opts.stageId,
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

  logs() {
    return this.prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
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
    @Body()
    dto: {
      candidateIds: string[];
      templateCode: string;
      stageId?: string;
      vars?: Record<string, string>;
      comment?: string;
    },
  ) {
    return this.service.sendBulk(dto);
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
