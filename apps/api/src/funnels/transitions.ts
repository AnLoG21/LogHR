import { ForbiddenException } from '@nestjs/common';
import { canMoveToStage, ROLE_LABELS, stageAllowedRoles, SystemRole } from '@skillaz/shared';

export function assertCanMoveToStage(
  transitions: unknown,
  stage: { code: string; name: string },
  role: string,
) {
  if (canMoveToStage(transitions, stage.code, role)) return;
  const roles = (stageAllowedRoles(transitions, stage.code) || [])
    .map((r) => ROLE_LABELS[r as SystemRole] || r)
    .join(', ');
  throw new ForbiddenException(`Перевести на этап «${stage.name}» могут только: ${roles}`);
}
