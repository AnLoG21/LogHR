// Idempotent demo candidates: updates existing ones by email/phone, creates missing ones.
// Usage (in api container): node prisma/demo-enrich.cjs
const { PrismaClient } = require('@prisma/client');
const DEMO = require('./demo-candidates.json');

async function applyDemoCandidates(prisma, opts = {}) {
  const result = { created: 0, updated: 0, skipped: 0 };
  for (const item of DEMO) {
    const { vacancyTitle, stageCode, birthDate, ...fields } = item;
    const vacancy = await prisma.vacancy.findFirst({
      where: { title: vacancyTitle },
      include: { funnel: { include: { stages: { orderBy: { order: 'asc' } } } } },
    });
    if (!vacancy) {
      result.skipped++;
      continue;
    }
    const stages = vacancy.funnel?.stages || [];
    const stage = stages.find((s) => s.code === stageCode) || stages[0];
    const data = {
      ...fields,
      birthDate: birthDate ? new Date(birthDate) : null,
      vacancyId: vacancy.id,
      resumeUpdatedAt: new Date(),
    };
    const or = [fields.email && { email: fields.email }, fields.phone && { phone: fields.phone }].filter(Boolean);
    const existing = await prisma.candidate.findFirst({ where: { OR: or } });
    if (existing) {
      await prisma.candidate.update({ where: { id: existing.id }, data });
      result.updated++;
      continue;
    }
    await prisma.candidate.create({
      data: {
        ...data,
        source: 'HH',
        addType: 'RESPONSE',
        hiringRequestId: opts.hiringRequestByVacancyId?.[vacancy.id],
        stageId: stage?.id,
        stageChangedAt: new Date(),
        pdnConsentAt: fields.email ? new Date() : null,
        statusHistory: stage ? { create: { stageId: stage.id, comment: 'Импорт демо-данных' } } : undefined,
      },
    });
    result.created++;
  }
  return result;
}

module.exports = { applyDemoCandidates };

if (require.main === module) {
  const prisma = new PrismaClient();
  applyDemoCandidates(prisma)
    .then((r) => console.log('demo candidates:', r))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
