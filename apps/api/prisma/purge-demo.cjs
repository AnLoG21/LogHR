/**
 * Удаляет демо/тестовые операционные данные, оставляя справочники, воронки,
 * шаблоны, ПДн и реальных пользователей (не *.local).
 *
 * Usage: node prisma/purge-demo.cjs
 * Optional: PURGE_DEMO_USERS=1 — также удалить @loghr.local / @taimyr.local
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function count(label, n) {
  console.log(`  ${label}: ${n}`);
  return n;
}

async function main() {
  console.log('[purge-demo] start');

  const del = async (name, fn) => {
    const r = await fn();
    await count(name, r.count ?? r ?? 0);
  };

  // Order respects FKs without Cascade on every relation
  await del('ProActionResult', () => prisma.proActionResult.deleteMany({}));
  await del('AssessmentAssignment', () => prisma.assessmentAssignment.deleteMany({}));
  await del('NotificationLog', () => prisma.notificationLog.deleteMany({}));
  await del('Offer', () => prisma.offer.deleteMany({}));
  await del('Check', () => prisma.check.deleteMany({}));
  await del('Task', () => prisma.task.deleteMany({}));
  await del('Comment', () => prisma.comment.deleteMany({}));
  await del('Attachment', () => prisma.attachment.deleteMany({}));
  await del('CandidateTag', () => prisma.candidateTag.deleteMany({}));
  await del('CandidateStatusHistory', () => prisma.candidateStatusHistory.deleteMany({}));
  await del('CandidateResponse', () => prisma.candidateResponse.deleteMany({}));
  await del('Publication', () => prisma.publication.deleteMany({}));
  await del('AutoPublishRule', () => prisma.autoPublishRule.deleteMany({}));
  await del('Candidate', () => prisma.candidate.deleteMany({}));
  await del('HiringRequestStatusHistory', () => prisma.hiringRequestStatusHistory.deleteMany({}));
  await del('HiringRequest', () => prisma.hiringRequest.deleteMany({}));
  await del('Demand', () => prisma.demand.deleteMany({}));
  await del('Vacancy', () => prisma.vacancy.deleteMany({}));

  // Soft-clean demo org units / profiles only if clearly seed-marked
  const demoOrgs = await prisma.orgUnit.findMany({
    where: {
      OR: [
        { code: { in: ['HQ', 'MINE-1'] } },
        { name: { contains: 'LogHR' } },
        { legalEntity: { contains: 'LogHR' } },
      ],
    },
    select: { id: true },
  });
  if (demoOrgs.length) {
    await del('OrgUnit(demo)', () => prisma.orgUnit.deleteMany({ where: { id: { in: demoOrgs.map((o) => o.id) } } }));
  }

  if (process.env.PURGE_DEMO_USERS === '1') {
    await del('User(*.local)', () =>
      prisma.user.deleteMany({
        where: {
          OR: [{ email: { endsWith: '@loghr.local' } }, { email: { endsWith: '@taimyr.local' } }],
          role: { not: 'ADMIN' },
        },
      }),
    );
    // Keep at least one ADMIN; remove extra demo admins if a real one exists
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
    const real = admins.filter((a) => !a.email.endsWith('.local'));
    if (real.length) {
      await del('User(demo ADMIN)', () =>
        prisma.user.deleteMany({
          where: {
            role: 'ADMIN',
            OR: [{ email: { endsWith: '@loghr.local' } }, { email: { endsWith: '@taimyr.local' } }],
          },
        }),
      );
    }
  }

  console.log('[purge-demo] done — справочники, воронки, шаблоны и админы сохранены');
}

main()
  .catch((e) => {
    console.error('[purge-demo] failed', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
