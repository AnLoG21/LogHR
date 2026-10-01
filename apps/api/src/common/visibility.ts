import { SystemRole } from '@prisma/client';

export type VisibilityScope = 'all' | 'orgUnit' | 'assigned' | 'checks';

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

  const scope = user.visibilityRules?.scope;

  if (scope === 'all') return {};

  if ((scope === 'orgUnit' || scope === 'own_org') && user.orgUnitId) {
    return {
      OR: [
        { hiringRequest: { orgUnitId: user.orgUnitId } },
        { vacancy: { orgUnitId: user.orgUnitId } },
        { hiringRequest: { hiringManagerId: user.id } },
        { hiringRequest: { recruiterId: user.id } },
      ],
    };
  }

  if (scope === 'assigned') {
    return {
      OR: [
        { assigneeId: user.id },
        { hiringRequest: { recruiterId: user.id } },
        { hiringRequest: { hiringManagerId: user.id } },
      ],
    };
  }

  if (scope === 'checks' || user.role === SystemRole.SECURITY) {
    return {
      OR: [
        { checks: { some: {} } },
        { assigneeId: user.id },
      ],
    };
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
