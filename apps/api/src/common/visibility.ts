import { SystemRole } from '@prisma/client';

/** Apply visibility profile heuristics to list queries */
export function visibilityWhere(user: {
  id: string;
  role: SystemRole;
  orgUnitId?: string | null;
  visibilityRules?: { scope?: string; description?: string } | null;
}) {
  if (user.role === SystemRole.ADMIN || user.role === SystemRole.HR_BP || user.role === SystemRole.RECRUITMENT_LEAD) {
    return {};
  }

  // Explicit profile rule: limit to user's org unit
  if (user.visibilityRules?.scope === 'orgUnit' && user.orgUnitId) {
    return {
      OR: [
        { hiringRequest: { orgUnitId: user.orgUnitId } },
        { vacancy: { orgUnitId: user.orgUnitId } },
        { hiringRequest: { hiringManagerId: user.id } },
        { hiringRequest: { recruiterId: user.id } },
      ],
    };
  }

  if (user.role === SystemRole.SECURITY) {
    return {};
  }
  if (user.role === SystemRole.HIRING_MANAGER && user.orgUnitId) {
    return {
      OR: [
        { hiringRequest: { orgUnitId: user.orgUnitId } },
        { vacancy: { orgUnitId: user.orgUnitId } },
        { hiringRequest: { hiringManagerId: user.id } },
      ],
    };
  }
  if (user.role === SystemRole.RECRUITER) {
    return {
      OR: [
        { hiringRequest: { recruiterId: user.id } },
        { vacancy: { hiringRequests: { some: { recruiterId: user.id } } } },
        { hiringRequestId: null },
      ],
    };
  }
  return {};
}
