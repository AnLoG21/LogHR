import { z } from 'zod';
import { CandidateAddType, HiringRequestStatus, JobBoard, SystemRole } from './enums';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const createCandidateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  city: z.string().optional(),
  address: z.string().optional(),
  source: z.nativeEnum(JobBoard).default(JobBoard.MANUAL),
  addType: z.nativeEnum(CandidateAddType).default(CandidateAddType.MANUAL),
  vacancyId: z.string().uuid().optional(),
  hiringRequestId: z.string().uuid().optional(),
  currentPosition: z.string().optional(),
  desiredPosition: z.string().optional(),
  about: z.string().optional(),
  citizenship: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.string().optional(),
  resumeUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const createHiringRequestSchema = z.object({
  title: z.string().min(1),
  orgUnitId: z.string().uuid(),
  candidateProfileId: z.string().uuid(),
  positionsCount: z.coerce.number().int().min(1).default(1),
  city: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  comment: z.string().optional(),
  hiringManagerId: z.string().uuid().optional(),
  recruiterId: z.string().uuid().optional(),
});

export const changeHiringRequestStatusSchema = z.object({
  status: z.nativeEnum(HiringRequestStatus),
  comment: z.string().optional(),
});

export const createVacancySchema = z.object({
  title: z.string().min(1),
  candidateProfileId: z.string().uuid(),
  orgUnitId: z.string().uuid().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  funnelId: z.string().uuid(),
  hiringRequestIds: z.array(z.string().uuid()).optional(),
});

export const changeCandidateStageSchema = z.object({
  stageId: z.string().uuid(),
  comment: z.string().optional(),
  formData: z.record(z.any()).optional(),
});

export const createOrgUnitSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  parentId: z.string().uuid().optional().nullable(),
  city: z.string().optional(),
  address: z.string().optional(),
  legalEntity: z.string().optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(SystemRole),
  orgUnitId: z.string().uuid().optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type CreateCandidateDto = z.infer<typeof createCandidateSchema>;
export type CreateHiringRequestDto = z.infer<typeof createHiringRequestSchema>;
export type CreateVacancyDto = z.infer<typeof createVacancySchema>;
export type CreateOrgUnitDto = z.infer<typeof createOrgUnitSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
