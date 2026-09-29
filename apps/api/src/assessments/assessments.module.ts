import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuestionnaireType, SystemRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';

@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService) {}

  listQuestionnaires() {
    return this.prisma.questionnaire.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
  }

  listScenarios() {
    return this.prisma.assessmentScenario.findMany({
      where: { isActive: true },
      include: { questionnaire: true, funnelStage: true },
    });
  }

  createQuestionnaire(data: { name: string; type: QuestionnaireType; schema: any }) {
    return this.prisma.questionnaire.create({ data });
  }

  createScenario(data: { name: string; funnelStageId: string; questionnaireId: string }) {
    return this.prisma.assessmentScenario.create({ data });
  }

  assign(candidateId: string, questionnaireId: string) {
    return this.prisma.assessmentAssignment.create({
      data: { candidateId, questionnaireId, externalToken: randomUUID() },
    });
  }

  async getByToken(token: string) {
    const item = await this.prisma.assessmentAssignment.findUnique({
      where: { externalToken: token },
      include: { questionnaire: true, candidate: { select: { firstName: true, lastName: true } } },
    });
    if (!item) throw new NotFoundException();
    return item;
  }

  async submit(token: string, result: any) {
    const item = await this.getByToken(token);
    return this.prisma.assessmentAssignment.update({
      where: { id: item.id },
      data: { result, status: 'COMPLETED', completedAt: new Date() },
    });
  }

  listAssignments(candidateId?: string) {
    return this.prisma.assessmentAssignment.findMany({
      where: candidateId ? { candidateId } : undefined,
      include: { questionnaire: true, candidate: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@ApiTags('assessments')
@Controller('assessments')
export class AssessmentsController {
  constructor(private service: AssessmentsService) {}

  @ApiBearerAuth()
  @Get('questionnaires')
  questionnaires() { return this.service.listQuestionnaires(); }

  @ApiBearerAuth()
  @Get('scenarios')
  scenarios() { return this.service.listScenarios(); }

  @ApiBearerAuth()
  @Get('assignments')
  assignments(@Query('candidateId') candidateId?: string) {
    return this.service.listAssignments(candidateId);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.HR_BP)
  @Post('questionnaires')
  createQ(@Body() dto: { name: string; type: QuestionnaireType; schema: any }) {
    return this.service.createQuestionnaire(dto);
  }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN)
  @Post('scenarios')
  createS(@Body() dto: { name: string; funnelStageId: string; questionnaireId: string }) {
    return this.service.createScenario(dto);
  }

  @ApiBearerAuth()
  @Post('assign')
  assign(@Body() dto: { candidateId: string; questionnaireId: string }) {
    return this.service.assign(dto.candidateId, dto.questionnaireId);
  }

  @Public()
  @Get('public/:token')
  publicGet(@Param('token') token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post('public/:token')
  publicSubmit(@Param('token') token: string, @Body() result: any) {
    return this.service.submit(token, result);
  }
}

@Module({ controllers: [AssessmentsController], providers: [AssessmentsService], exports: [AssessmentsService] })
export class AssessmentsModule {}
