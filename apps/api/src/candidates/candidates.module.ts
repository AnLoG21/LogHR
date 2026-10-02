import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CandidateAddType,
  JobBoard,
  Prisma,
  SystemRole,
} from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, Roles } from '../common/guards';
import { pageResult, paginate } from '../common/pagination';
import { visibilityWhere } from '../common/visibility';
import { assertCanMoveToStage } from '../funnels/transitions';
import { StorageService } from '../storage/storage.module';

@Injectable()
export class CandidatesService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  async list(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    vacancyId?: string;
    hiringRequestId?: string;
    orgUnitId?: string;
    stageId?: string;
    stageIds?: string;
    excludeStageIds?: string;
    source?: JobBoard;
    sources?: string;
    view?: 'short' | 'full';
    sort?: string;
    favoritesOnly?: string;
    trackedOnly?: string;
    interviewToday?: string;
    interviewTomorrow?: string;
    salaryFrom?: string;
    salaryTo?: string;
    hideWithoutSalary?: string;
    ageFrom?: string;
    ageTo?: string;
    hideWithoutAge?: string;
    gender?: string;
    willingToRelocate?: string;
    lastJobBucket?: string;
    employmentType?: string;
    workSchedule?: string;
    resumeUpdatedFrom?: string;
    resumeUpdatedTo?: string;
    meetingType?: string;
    meetingFrom?: string;
    meetingTo?: string;
    tagIds?: string;
    tagAssignedFrom?: string;
    tagAssignedTo?: string;
    assigneeId?: string;
    assigneeRole?: string;
    checkStatus?: string;
    offerStatus?: string;
    consentType?: string;
    hasConsent?: string;
    scoreFrom?: string;
    scoreTo?: string;
    addTypes?: string;
  }, user?: AuthUser) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const csv = (v?: string) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
    const stageIds = csv(query.stageIds);
    const excludeStageIds = csv(query.excludeStageIds);
    const sources = csv(query.sources) as JobBoard[];
    const tagIds = csv(query.tagIds);
    const checkStatuses = csv(query.checkStatus);
    const offerStatuses = csv(query.offerStatus);
    const addTypes = csv(query.addTypes);

    const and: Prisma.CandidateWhereInput[] = [
      { isDepersonalized: false },
        user ? visibilityWhere({
          id: user.id,
          role: user.role as any,
          orgUnitId: (user as any).orgUnitId,
          visibilityRules: (user as any).visibilityRules,
        }) : {},
    ];

    if (query.search) {
      and.push({
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { about: { contains: query.search, mode: 'insensitive' } },
          { resumeText: { contains: query.search, mode: 'insensitive' } },
          { currentPosition: { contains: query.search, mode: 'insensitive' } },
          { desiredPosition: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.vacancyId) {
      and.push({ OR: [{ vacancyId: query.vacancyId }, { vacancy: { parentId: query.vacancyId } }] });
    }
    if (query.hiringRequestId) and.push({ hiringRequestId: query.hiringRequestId });
    if (query.stageId) and.push({ stageId: query.stageId });
    if (stageIds.length) and.push({ stageId: { in: stageIds } });
    if (excludeStageIds.length) and.push({ OR: [{ stageId: { notIn: excludeStageIds } }, { stageId: null }] });
    if (query.source) and.push({ source: query.source });
    if (sources.length) and.push({ source: { in: sources } });
    if (query.orgUnitId) {
      and.push({
        OR: [
          { vacancy: { orgUnitId: query.orgUnitId } },
          { hiringRequest: { orgUnitId: query.orgUnitId } },
        ],
      });
    }
    if (query.favoritesOnly === '1' || query.favoritesOnly === 'true') and.push({ isFavorite: true });
    if (query.trackedOnly === '1' || query.trackedOnly === 'true') and.push({ isTracked: true });

    const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    if (query.interviewToday === '1' || query.interviewToday === 'true') {
      const n = new Date();
      and.push({ meetingAt: { gte: dayStart(n), lte: dayEnd(n) } });
    }
    if (query.interviewTomorrow === '1' || query.interviewTomorrow === 'true') {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      and.push({ meetingAt: { gte: dayStart(t), lte: dayEnd(t) } });
    }

    if (query.salaryFrom) and.push({ salaryExpect: { gte: Number(query.salaryFrom) } });
    if (query.salaryTo) and.push({ salaryExpect: { lte: Number(query.salaryTo) } });
    if (query.hideWithoutSalary === '1') and.push({ salaryExpect: { not: null } });

    if (query.ageFrom || query.ageTo || query.hideWithoutAge === '1') {
      const now = new Date();
      if (query.hideWithoutAge === '1' || query.ageFrom || query.ageTo) {
        and.push({ birthDate: { not: null } });
      }
      if (query.ageFrom) {
        const maxBirth = new Date(now);
        maxBirth.setFullYear(maxBirth.getFullYear() - Number(query.ageFrom));
        and.push({ birthDate: { lte: maxBirth } });
      }
      if (query.ageTo) {
        const minBirth = new Date(now);
        minBirth.setFullYear(minBirth.getFullYear() - Number(query.ageTo) - 1);
        and.push({ birthDate: { gte: minBirth } });
      }
    }

    if (query.gender) and.push({ gender: query.gender });
    if (query.willingToRelocate === '1') and.push({ willingToRelocate: true });
    if (query.employmentType) and.push({ employmentType: query.employmentType });
    if (query.workSchedule) and.push({ workSchedule: query.workSchedule });

    if (query.lastJobBucket === 'lt1') and.push({ lastJobMonths: { lt: 12 } });
    if (query.lastJobBucket === '1to3') and.push({ lastJobMonths: { gte: 12, lt: 36 } });
    if (query.lastJobBucket === '3to6') and.push({ lastJobMonths: { gte: 36, lt: 72 } });
    if (query.lastJobBucket === 'gt6') and.push({ lastJobMonths: { gte: 72 } });

    if (query.resumeUpdatedFrom) and.push({ resumeUpdatedAt: { gte: new Date(query.resumeUpdatedFrom) } });
    if (query.resumeUpdatedTo) and.push({ resumeUpdatedAt: { lte: new Date(query.resumeUpdatedTo) } });
    if (query.meetingType) and.push({ meetingType: query.meetingType });
    if (query.meetingFrom) and.push({ meetingAt: { gte: new Date(query.meetingFrom) } });
    if (query.meetingTo) and.push({ meetingAt: { lte: new Date(query.meetingTo) } });

    if (tagIds.length) {
      const tagWhere: Prisma.CandidateTagWhereInput = { tagId: { in: tagIds } };
      if (query.tagAssignedFrom || query.tagAssignedTo) {
        tagWhere.assignedAt = {
          ...(query.tagAssignedFrom ? { gte: new Date(query.tagAssignedFrom) } : {}),
          ...(query.tagAssignedTo ? { lte: new Date(query.tagAssignedTo) } : {}),
        };
      }
      and.push({ tags: { some: tagWhere } });
    }

    if (query.assigneeId) and.push({ assigneeId: query.assigneeId });
    if (query.assigneeRole) and.push({ assignee: { role: query.assigneeRole as SystemRole } });
    if (checkStatuses.length) and.push({ checks: { some: { status: { in: checkStatuses as any } } } });
    if (offerStatuses.length) and.push({ offers: { some: { status: { in: offerStatuses as any } } } });
    if (query.consentType) and.push({ consentType: query.consentType });
    if (query.hasConsent === '1') and.push({ pdnConsentAt: { not: null } });
    if (query.hasConsent === '0') and.push({ pdnConsentAt: null });
    if (query.scoreFrom) and.push({ aiScore: { gte: Number(query.scoreFrom) } });
    if (query.scoreTo) and.push({ aiScore: { lte: Number(query.scoreTo) } });
    if (addTypes.length) and.push({ addType: { in: addTypes as any } });

    const where: Prisma.CandidateWhereInput = { AND: and };

    const include =
      query.view === 'full'
        ? {
            stage: true,
            vacancy: { select: { id: true, title: true, orgUnitId: true } },
            hiringRequest: { select: { id: true, title: true, orgUnitId: true } },
            tags: { include: { tag: true } },
            checks: { select: { id: true, type: true, status: true } },
            offers: { select: { id: true, status: true }, take: 3, orderBy: { createdAt: 'desc' as const } },
            assignee: { select: { id: true, firstName: true, lastName: true, role: true } },
          }
        : {
            stage: true,
            vacancy: { select: { id: true, title: true } },
          };

    let orderBy: Prisma.CandidateOrderByWithRelationInput = { updatedAt: 'desc' };
    const sort = query.sort || 'updatedAt_desc';
    if (sort === 'createdAt_desc') orderBy = { createdAt: 'desc' };
    if (sort === 'createdAt_asc') orderBy = { createdAt: 'asc' };
    if (sort === 'lastName_asc') orderBy = { lastName: 'asc' };
    if (sort === 'lastName_desc') orderBy = { lastName: 'desc' };
    if (sort === 'aiScore_desc') orderBy = { aiScore: 'desc' };
    if (sort === 'salaryExpect_desc') orderBy = { salaryExpect: 'desc' };
    if (sort === 'meetingAt_asc') orderBy = { meetingAt: 'asc' };

    const [items, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        skip,
        take,
        orderBy,
        include,
      }),
      this.prisma.candidate.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async toggleFlag(id: string, patch: { isFavorite?: boolean; isTracked?: boolean }) {
    await this.ensureExists(id);
    return this.prisma.candidate.update({
      where: { id },
      data: {
        ...(patch.isFavorite != null ? { isFavorite: patch.isFavorite } : {}),
        ...(patch.isTracked != null ? { isTracked: patch.isTracked } : {}),
      },
      select: { id: true, isFavorite: true, isTracked: true },
    });
  }

  async update(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      middleName?: string | null;
      phone?: string | null;
      email?: string | null;
      city?: string | null;
      gender?: string | null;
      about?: string | null;
      tagIds?: string[];
    },
  ) {
    await this.ensureExists(id);
    if (data.tagIds) {
      await this.prisma.candidateTag.deleteMany({ where: { candidateId: id } });
      if (data.tagIds.length) {
        await this.prisma.candidateTag.createMany({
          data: data.tagIds.map((tagId) => ({ candidateId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }
    const { tagIds: _t, ...fields } = data;
    return this.prisma.candidate.update({
      where: { id },
      data: {
        ...(fields.firstName != null ? { firstName: fields.firstName } : {}),
        ...(fields.lastName != null ? { lastName: fields.lastName } : {}),
        ...(fields.middleName !== undefined ? { middleName: fields.middleName } : {}),
        ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
        ...(fields.email !== undefined ? { email: fields.email } : {}),
        ...(fields.city !== undefined ? { city: fields.city } : {}),
        ...(fields.gender !== undefined ? { gender: fields.gender } : {}),
        ...(fields.about !== undefined ? { about: fields.about } : {}),
      },
      include: {
        stage: true,
        tags: { include: { tag: true } },
      },
    });
  }

  async get(id: string) {
    const item = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        stage: true,
        vacancy: {
          include: {
            funnel: { include: { stages: { orderBy: { order: 'asc' } } } },
          },
        },
        hiringRequest: true,
        tags: { include: { tag: { include: { category: true } } } },
        comments: {
          include: { author: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        attachments: { orderBy: { createdAt: 'desc' } },
        statusHistory: {
          include: {
            stage: true,
            changedBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        checks: {
          orderBy: { createdAt: 'desc' },
          include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
        },
        offers: { orderBy: { createdAt: 'desc' } },
        responses: { orderBy: { receivedAt: 'desc' } },
        assessments: { include: { questionnaire: true } },
        tasks: { where: { status: 'OPEN' } },
      },
    });
    if (!item) throw new NotFoundException();
    return item;
  }

  async findDuplicates(data: { phone?: string; email?: string; firstName?: string; lastName?: string }) {
    const or: Prisma.CandidateWhereInput[] = [];
    if (data.phone) or.push({ phone: data.phone });
    if (data.email) or.push({ email: { equals: data.email } });
    if (data.firstName && data.lastName) {
      or.push({
        AND: [
          { firstName: { equals: data.firstName } },
          { lastName: { equals: data.lastName } },
        ],
      });
    }
    if (!or.length) return [];
    return this.prisma.candidate.findMany({
      where: { OR: or, isDepersonalized: false },
      take: 10,
      include: { stage: true, vacancy: { select: { id: true, title: true } } },
    });
  }

  async create(
    data: {
      firstName: string;
      lastName: string;
      middleName?: string;
      phone?: string;
      email?: string;
      city?: string;
      address?: string;
      source?: JobBoard;
      addType?: CandidateAddType;
      vacancyId?: string;
      hiringRequestId?: string;
      currentPosition?: string;
      desiredPosition?: string;
      about?: string;
      citizenship?: string;
      birthDate?: string;
      gender?: string;
      resumeUrl?: string;
      tags?: string[];
      forceDuplicate?: boolean;
    },
    user: AuthUser,
  ) {
    if (!data.forceDuplicate) {
      const dups = await this.findDuplicates(data);
      if (dups.length) {
        return { duplicateWarning: true, duplicates: dups };
      }
    }

    let stageId: string | undefined;
    if (data.vacancyId) {
      const vacancy = await this.prisma.vacancy.findUnique({
        where: { id: data.vacancyId },
        include: { funnel: { include: { stages: { orderBy: { order: 'asc' }, take: 1 } } } },
      });
      stageId = vacancy?.funnel.stages[0]?.id;
    }

    const candidate = await this.prisma.candidate.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        phone: data.phone,
        email: data.email || null,
        city: data.city,
        address: data.address,
        source: data.source ?? 'MANUAL',
        addType: data.addType ?? 'MANUAL',
        vacancyId: data.vacancyId,
        hiringRequestId: data.hiringRequestId,
        currentPosition: data.currentPosition,
        desiredPosition: data.desiredPosition,
        about: data.about,
        citizenship: data.citizenship,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        gender: data.gender,
        resumeUrl: data.resumeUrl,
        stageId,
        stageChangedAt: stageId ? new Date() : undefined,
        statusHistory: stageId
          ? {
              create: {
                stageId,
                comment: 'Кандидат создан',
                changedById: user.id,
              },
            }
          : undefined,
        tags: data.tags?.length
          ? {
              create: data.tags.map((tagId) => ({ tagId })),
            }
          : undefined,
      },
    });

    if (stageId) {
      await this.maybeLaunchAssessments(candidate.id, stageId);
    }

    return this.get(candidate.id);
  }

  async changeStage(
    id: string,
    stageId: string,
    user: AuthUser,
    comment?: string,
    formData?: Record<string, unknown>,
  ) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: { vacancy: { include: { funnel: { include: { stages: true } } } } },
    });
    if (!candidate) throw new NotFoundException();
    const stage = candidate.vacancy?.funnel.stages.find((s) => s.id === stageId);
    if (!stage) throw new BadRequestException('Этап не принадлежит воронке вакансии');
    assertCanMoveToStage(candidate.vacancy!.funnel.transitions, stage, user.role);

    await this.prisma.candidate.update({
      where: { id },
      data: {
        stageId,
        stageChangedAt: new Date(),
        statusHistory: {
          create: {
            stageId,
            comment,
            formData: formData as any,
            changedById: user.id,
          },
        },
      },
    });

    await this.prisma.task.create({
      data: {
        title: `Действие по этапу «${stage.name}»: ${candidate.lastName} ${candidate.firstName}`,
        candidateId: id,
        stageId,
        assigneeId: user.id,
        createdById: user.id,
      },
    });

    await this.maybeLaunchAssessments(id, stageId);
    return this.get(id);
  }

  private async maybeLaunchAssessments(candidateId: string, stageId: string) {
    const scenarios = await this.prisma.assessmentScenario.findMany({
      where: { funnelStageId: stageId, isActive: true },
      include: { questionnaire: true },
    });
    for (const s of scenarios) {
      const exists = await this.prisma.assessmentAssignment.findFirst({
        where: {
          candidateId,
          questionnaireId: s.questionnaireId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      });
      if (!exists) {
        await this.prisma.assessmentAssignment.create({
          data: {
            candidateId,
            questionnaireId: s.questionnaireId,
            externalToken: cryptoRandom(),
          },
        });
      }
      const isPro =
        /proaction/i.test(s.name) ||
        /proaction/i.test(s.questionnaire?.name || '') ||
        s.questionnaire?.type === 'TEST' && /proaction/i.test(JSON.stringify(s.questionnaire?.schema || {}));
      if (isPro || process.env.PROACTION_AUTO_ALL === '1') {
        await this.prisma.proActionResult.create({
          data: {
            candidateId,
            status: 'PENDING',
            payload: {
              launchedAt: new Date().toISOString(),
              stageId,
              scenarioId: s.id,
              note: process.env.PROACTION_WEBHOOK_SECRET
                ? 'Ожидание webhook ProAction'
                : 'ProAction: задайте PROACTION_WEBHOOK_SECRET для приёма результатов',
            },
          },
        });
      }
    }
  }

  async findDuplicatesOf(id: string) {
    const c = await this.prisma.candidate.findUnique({ where: { id } });
    if (!c) throw new NotFoundException();
    const dups = await this.findDuplicates({
      phone: c.phone || undefined,
      email: c.email || undefined,
      firstName: c.firstName,
      lastName: c.lastName,
    });
    return dups.filter((d) => d.id !== id);
  }

  /**
   * Keep keepId, move history/attachments from mergeId onto it, then depersonalize the duplicate.
   */
  async merge(keepId: string, mergeId: string, user: AuthUser) {
    if (keepId === mergeId) throw new BadRequestException('Нельзя слить кандидата с самим собой');
    const [keep, merge] = await Promise.all([
      this.prisma.candidate.findUnique({ where: { id: keepId }, include: { tags: true } }),
      this.prisma.candidate.findUnique({ where: { id: mergeId }, include: { tags: true } }),
    ]);
    if (!keep || !merge) throw new NotFoundException();
    if (keep.isDepersonalized || merge.isDepersonalized) {
      throw new BadRequestException('Один из кандидатов уже обезличен');
    }
    if (merge.duplicateOfId) throw new BadRequestException('Кандидат уже помечен как дубликат');

    const keepTagIds = new Set(keep.tags.map((t) => t.tagId));
    const newTags = merge.tags.filter((t) => !keepTagIds.has(t.tagId)).map((t) => t.tagId);

    await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.comment.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
        tx.attachment.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
        tx.candidateStatusHistory.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
        tx.check.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
        tx.offer.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
        tx.candidateResponse.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
        tx.assessmentAssignment.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
        tx.task.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
        tx.proActionResult.updateMany({ where: { candidateId: mergeId }, data: { candidateId: keepId } }),
      ]);
      if (newTags.length) {
        await tx.candidateTag.createMany({
          data: newTags.map((tagId) => ({ candidateId: keepId, tagId })),
          skipDuplicates: true,
        });
      }
      await tx.candidateTag.deleteMany({ where: { candidateId: mergeId } });

      const fill = <T>(a: T | null | undefined, b: T | null | undefined) => (a != null && a !== '' ? a : b);
      await tx.candidate.update({
        where: { id: keepId },
        data: {
          middleName: fill(keep.middleName, merge.middleName),
          phone: fill(keep.phone, merge.phone),
          email: fill(keep.email, merge.email),
          city: fill(keep.city, merge.city),
          address: fill(keep.address, merge.address),
          birthDate: fill(keep.birthDate, merge.birthDate),
          gender: fill(keep.gender, merge.gender),
          citizenship: fill(keep.citizenship, merge.citizenship),
          about: fill(keep.about, merge.about),
          currentPosition: fill(keep.currentPosition, merge.currentPosition),
          desiredPosition: fill(keep.desiredPosition, merge.desiredPosition),
          resumeUrl: fill(keep.resumeUrl, merge.resumeUrl),
          resumeText: (keep.resumeText?.length || 0) >= (merge.resumeText?.length || 0)
            ? keep.resumeText
            : merge.resumeText,
          vacancyId: keep.vacancyId || merge.vacancyId,
          hiringRequestId: keep.hiringRequestId || merge.hiringRequestId,
          stageId: keep.stageId || merge.stageId,
          stageChangedAt: keep.stageChangedAt || merge.stageChangedAt,
          externalId: keep.externalId || merge.externalId,
          salaryExpect: keep.salaryExpect ?? merge.salaryExpect,
          assigneeId: keep.assigneeId || merge.assigneeId,
          isFavorite: keep.isFavorite || merge.isFavorite,
          isTracked: keep.isTracked || merge.isTracked,
          pdnConsentAt: keep.pdnConsentAt || merge.pdnConsentAt,
          meetingAt: keep.meetingAt || merge.meetingAt,
          aiScore: keep.aiScore ?? merge.aiScore,
        },
      });

      await tx.candidate.update({
        where: { id: mergeId },
        data: {
          duplicateOfId: keepId,
          isDepersonalized: true,
          firstName: 'Дубликат',
          lastName: keepId.slice(0, 8),
          middleName: null,
          phone: null,
          email: null,
          address: null,
          about: null,
          resumeText: null,
          resumeUrl: null,
          stageId: null,
          vacancyId: null,
          hiringRequestId: null,
        },
      });

      await tx.comment.create({
        data: {
          candidateId: keepId,
          authorId: user.id,
          body: `Слит дубликат ${merge.lastName} ${merge.firstName} (${mergeId.slice(0, 8)})`,
        },
      });
    });

    return this.get(keepId);
  }

  async addComment(id: string, body: string, user: AuthUser) {
    await this.ensureExists(id);
    return this.prisma.comment.create({
      data: { candidateId: id, body, authorId: user.id },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async depersonalize(id: string, fields: string[]) {
    const candidate = await this.ensureExists(id);
    const data: any = { isDepersonalized: true };
    const allowed = ['firstName', 'lastName', 'middleName', 'phone', 'email', 'address', 'about', 'resumeText', 'resumeUrl'];
    for (const f of fields) {
      if (allowed.includes(f)) data[f] = f.includes('Name') ? '***' : null;
    }
    if (!fields.includes('firstName')) data.firstName = 'Обезличен';
    if (!fields.includes('lastName')) data.lastName = candidate.id.slice(0, 8);
    return this.prisma.candidate.update({ where: { id }, data });
  }

  /** Полное удаление карточки (тестовые / ошибочно созданные). Задачи отвязываются, файлы удаляются. */
  async remove(id: string) {
    await this.ensureExists(id);
    const atts = await this.prisma.attachment.findMany({ where: { candidateId: id } });
    for (const a of atts) {
      try {
        await this.storage.deleteByUrl(a.url);
      } catch {
        /* файл мог уже отсутствовать */
      }
    }
    await this.prisma.$transaction([
      this.prisma.task.updateMany({ where: { candidateId: id }, data: { candidateId: null } }),
      this.prisma.candidate.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  async importResumeText(id: string, text: string, fileName?: string) {
    await this.ensureExists(id);
    await this.prisma.candidate.update({
      where: { id },
      data: { resumeText: text },
    });
    if (fileName) {
      await this.prisma.attachment.create({
        data: {
          candidateId: id,
          fileName,
          mimeType: 'text/plain',
          url: `local://resumes/${id}/${fileName}`,
          size: text.length,
        },
      });
    }
    return this.get(id);
  }

  async addAttachment(id: string, file: Express.Multer.File) {
    await this.ensureExists(id);
    if (!file?.buffer?.length) throw new BadRequestException('Выберите файл');
    const max = Number(process.env.UPLOAD_MAX_BYTES || 15 * 1024 * 1024);
    if (file.size > max) throw new BadRequestException(`Файл больше ${Math.round(max / 1024 / 1024)} МБ`);
    const uploaded = await this.storage.upload(file.buffer, file.originalname || 'file', file.mimetype);
    return this.prisma.attachment.create({
      data: {
        candidateId: id,
        fileName: file.originalname || uploaded.key,
        mimeType: file.mimetype || 'application/octet-stream',
        url: uploaded.url,
        size: file.size,
      },
    });
  }

  async removeAttachment(id: string, attachmentId: string) {
    const att = await this.prisma.attachment.findFirst({ where: { id: attachmentId, candidateId: id } });
    if (!att) throw new NotFoundException();
    await this.storage.deleteByUrl(att.url);
    await this.prisma.attachment.delete({ where: { id: att.id } });
    return { ok: true };
  }

  async setPdnConsent(id: string) {
    await this.ensureExists(id);
    return this.prisma.candidate.update({
      where: { id },
      data: { pdnConsentAt: new Date() },
    });
  }

  private async ensureExists(id: string) {
    const c = await this.prisma.candidate.findUnique({ where: { id } });
    if (!c) throw new NotFoundException();
    return c;
  }
}

function cryptoRandom() {
  return require('crypto').randomUUID();
}

class CreateCandidateDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsEnum(JobBoard) source?: JobBoard;
  @IsOptional() @IsEnum(CandidateAddType) addType?: CandidateAddType;
  @IsOptional() @IsUUID() vacancyId?: string;
  @IsOptional() @IsUUID() hiringRequestId?: string;
  @IsOptional() @IsString() currentPosition?: string;
  @IsOptional() @IsString() desiredPosition?: string;
  @IsOptional() @IsString() about?: string;
  @IsOptional() @IsString() citizenship?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() resumeUrl?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() forceDuplicate?: boolean;
}

class ChangeStageDto {
  @IsUUID() stageId!: string;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() formData?: Record<string, unknown>;
}

class UpdateCandidateDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() about?: string;
  @IsOptional() @IsArray() tagIds?: string[];
}

@ApiTags('candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(private service: CandidatesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.list({
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      search: query.search,
      vacancyId: query.vacancyId,
      hiringRequestId: query.hiringRequestId || query.requestId,
      orgUnitId: query.orgUnitId,
      stageId: query.stageId,
      stageIds: query.stageIds,
      excludeStageIds: query.excludeStageIds,
      source: query.source as JobBoard | undefined,
      sources: query.sources,
      view: (query.view as 'short' | 'full') || 'full',
      sort: query.sort,
      favoritesOnly: query.favoritesOnly,
      trackedOnly: query.trackedOnly,
      interviewToday: query.interviewToday,
      interviewTomorrow: query.interviewTomorrow,
      salaryFrom: query.salaryFrom,
      salaryTo: query.salaryTo,
      hideWithoutSalary: query.hideWithoutSalary,
      ageFrom: query.ageFrom,
      ageTo: query.ageTo,
      hideWithoutAge: query.hideWithoutAge,
      gender: query.gender,
      willingToRelocate: query.willingToRelocate,
      lastJobBucket: query.lastJobBucket,
      employmentType: query.employmentType,
      workSchedule: query.workSchedule,
      resumeUpdatedFrom: query.resumeUpdatedFrom,
      resumeUpdatedTo: query.resumeUpdatedTo,
      meetingType: query.meetingType,
      meetingFrom: query.meetingFrom,
      meetingTo: query.meetingTo,
      tagIds: query.tagIds,
      tagAssignedFrom: query.tagAssignedFrom,
      tagAssignedTo: query.tagAssignedTo,
      assigneeId: query.assigneeId,
      assigneeRole: query.assigneeRole,
      checkStatus: query.checkStatus,
      offerStatus: query.offerStatus,
      consentType: query.consentType,
      hasConsent: query.hasConsent,
      scoreFrom: query.scoreFrom,
      scoreTo: query.scoreTo,
      addTypes: query.addTypes,
    }, user);
  }

  @Patch(':id/flags')
  flags(
    @Param('id') id: string,
    @Body() body: { isFavorite?: boolean; isTracked?: boolean },
  ) {
    return this.service.toggleFlag(id, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    return this.service.update(id, dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateCandidateDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Post(':id/stage')
  changeStage(
    @Param('id') id: string,
    @Body() dto: ChangeStageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.changeStage(id, dto.stageId, user, dto.comment, dto.formData);
  }

  @Post(':id/comments')
  comment(
    @Param('id') id: string,
    @Body('body') body: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addComment(id, body, user);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD, SystemRole.HR_BP)
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.addAttachment(id, file);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD, SystemRole.HR_BP)
  @Delete(':id/attachments/:attachmentId')
  removeAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string) {
    return this.service.removeAttachment(id, attachmentId);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Post(':id/depersonalize')
  depersonalize(@Param('id') id: string, @Body('fields') fields: string[]) {
    return this.service.depersonalize(id, fields || ['phone', 'email', 'address']);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD, SystemRole.RECRUITER, SystemRole.HR_BP)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/pdn-consent')
  pdnConsent(@Param('id') id: string) {
    return this.service.setPdnConsent(id);
  }

  @Post(':id/resume')
  @UseInterceptors(FileInterceptor('file'))
  async uploadResume(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('text') text?: string,
  ) {
    const content = text || file?.buffer?.toString('utf8') || '';
    return this.service.importResumeText(id, content, file?.originalname);
  }

  @Post('dedupe/check')
  checkDupe(@Body() dto: { phone?: string; email?: string; firstName?: string; lastName?: string }) {
    return this.service.findDuplicates(dto);
  }

  @Get(':id/duplicates')
  duplicatesOf(@Param('id') id: string) {
    return this.service.findDuplicatesOf(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD, SystemRole.RECRUITER)
  @Post(':id/merge')
  merge(
    @Param('id') id: string,
    @Body() dto: { mergeId: string },
    @CurrentUser() user: AuthUser,
  ) {
    if (!dto.mergeId) throw new BadRequestException('Укажите mergeId');
    return this.service.merge(id, dto.mergeId, user);
  }
}

@Module({ controllers: [CandidatesController], providers: [CandidatesService], exports: [CandidatesService] })
export class CandidatesModule {}
