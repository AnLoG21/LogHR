import { PrismaClient, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { FUNNEL_1_STAGES, FUNNEL_2_STAGES } from '@skillaz/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');

  const passwordHash = await bcrypt.hash('admin123', 10);

  const hq = await prisma.orgUnit.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'LogHR — Головной офис',
      code: 'HQ',
      city: 'Норильск',
      address: 'ул. Ленинский проспект, 1',
      legalEntity: 'ООО LogHR',
    },
  });

  const mine = await prisma.orgUnit.create({
    data: {
      name: 'Участок добычи №1',
      code: 'MINE-1',
      city: 'Норильск',
      parentId: hq.id,
      legalEntity: 'ООО LogHR',
    },
  });

  const visibilityProfiles = [
    { code: 'HIRING_MANAGER', name: 'Нанимающий менеджер', rules: { scope: 'own_org' } },
    { code: 'RECRUITMENT_LEAD', name: 'Руководитель направления подбора', rules: { scope: 'all' } },
    { code: 'RECRUITER', name: 'Рекрутер', rules: { scope: 'assigned' } },
    { code: 'HR_BP', name: 'HR BP', rules: { scope: 'all' } },
    { code: 'SECURITY', name: 'Сотрудник СБ', rules: { scope: 'checks' } },
  ];
  for (const vp of visibilityProfiles) {
    await prisma.visibilityProfile.upsert({
      where: { code: vp.code },
      update: {},
      create: vp,
    });
  }

  const processRoles = [
    { code: 'REQUEST_OWNER', name: 'Владелец заявки', objectType: 'HiringRequest', rules: { field: 'hiringManagerId' } },
    { code: 'RECRUITER_OWNER', name: 'Рекрутер заявки', objectType: 'HiringRequest', rules: { field: 'recruiterId' } },
    { code: 'ORG_HEAD', name: 'Руководитель орг. единицы', objectType: 'OrgUnit', rules: {} },
    { code: 'VACANCY_OWNER', name: 'Владелец вакансии', objectType: 'Vacancy', rules: {} },
    { code: 'CHECK_ASSIGNEE', name: 'Исполнитель проверки', objectType: 'Check', rules: { field: 'assigneeId' } },
    { code: 'DEMAND_OWNER', name: 'Владелец потребности', objectType: 'Demand', rules: {} },
  ];
  for (const pr of processRoles) {
    await prisma.processRole.upsert({
      where: { code: pr.code },
      update: {},
      create: pr,
    });
  }

  const users: Array<{ email: string; role: SystemRole; firstName: string; lastName: string }> = [
    { email: 'admin@loghr.local', role: 'ADMIN', firstName: 'Анна', lastName: 'Админова' },
    { email: 'hrbp@loghr.local', role: 'HR_BP', firstName: 'Елена', lastName: 'Петрова' },
    { email: 'lead@loghr.local', role: 'RECRUITMENT_LEAD', firstName: 'Игорь', lastName: 'Смирнов' },
    { email: 'manager@loghr.local', role: 'HIRING_MANAGER', firstName: 'Олег', lastName: 'Кузнецов' },
    { email: 'recruiter@loghr.local', role: 'RECRUITER', firstName: 'Мария', lastName: 'Иванова' },
    { email: 'security@loghr.local', role: 'SECURITY', firstName: 'Дмитрий', lastName: 'Соколов' },
    // legacy aliases
    { email: 'admin@taimyr.local', role: 'ADMIN', firstName: 'Анна', lastName: 'Админова' },
    { email: 'recruiter@taimyr.local', role: 'RECRUITER', firstName: 'Мария', lastName: 'Иванова' },
  ];

  const userMap: Record<string, string> = {};
  for (const u of users) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        orgUnitId: hq.id,
      },
    });
    userMap[u.role] = created.id;
  }

  const funnel1 = await prisma.funnel.upsert({
    where: { code: 'STANDARD_6' },
    update: {},
    create: {
      name: 'Стандартная воронка (6 этапов)',
      code: 'STANDARD_6',
      stages: {
        create: FUNNEL_1_STAGES.map((s) => ({
          code: s.code,
          name: s.name,
          order: s.order,
          isFinal: s.code === 'ONBOARDING',
        })),
      },
    },
    include: { stages: true },
  });

  const funnel2 = await prisma.funnel.upsert({
    where: { code: 'EXTENDED_8' },
    update: {},
    create: {
      name: 'Расширенная воронка (8 этапов)',
      code: 'EXTENDED_8',
      stages: {
        create: FUNNEL_2_STAGES.map((s) => ({
          code: s.code,
          name: s.name,
          order: s.order,
          isFinal: s.code === 'ONBOARDING',
        })),
      },
    },
    include: { stages: true },
  });

  const profileAgro = await prisma.candidateProfile.create({
    data: {
      name: 'Агроном-технолог',
      description: 'Ведение агротехнологических процессов',
      department: 'Производство',
      grade: 'Специалист',
    },
  });
  const profileAnalyst = await prisma.candidateProfile.create({
    data: {
      name: 'Продуктовый аналитик',
      description: 'Аналитика продукта и метрик',
      department: 'IT',
      grade: 'Middle',
    },
  });
  const profileDriver = await prisma.candidateProfile.create({
    data: {
      name: 'Водитель карьерной техники',
      department: 'Логистика',
      grade: 'Рабочий',
    },
  });

  await prisma.demand.create({
    data: {
      orgUnitId: mine.id,
      candidateProfileId: profileAgro.id,
      positionsCount: 2,
      comment: 'Сезонный набор',
    },
  });

  const request = await prisma.hiringRequest.create({
    data: {
      title: 'Агроном-технолог — Норильск',
      orgUnitId: mine.id,
      candidateProfileId: profileAgro.id,
      positionsCount: 2,
      city: 'Норильск',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      hiringManagerId: userMap.HIRING_MANAGER,
      recruiterId: userMap.RECRUITER,
      statusHistory: {
        create: [
          { toStatus: 'NEW' },
          { fromStatus: 'NEW', toStatus: 'PENDING_HR_BP' },
          { fromStatus: 'PENDING_HR_BP', toStatus: 'APPROVED_HR_BP', changedById: userMap.HR_BP },
          { fromStatus: 'APPROVED_HR_BP', toStatus: 'IN_PROGRESS' },
        ],
      },
    },
  });

  const vacancy = await prisma.vacancy.create({
    data: {
      title: 'Агроном-технолог — Норильск',
      description: 'Требуется агроном-технолог на участок добычи.',
      city: 'Норильск',
      orgUnitId: mine.id,
      candidateProfileId: profileAgro.id,
      funnelId: funnel1.id,
    },
  });

  await prisma.hiringRequest.update({
    where: { id: request.id },
    data: { vacancyId: vacancy.id },
  });

  const vacancy2 = await prisma.vacancy.create({
    data: {
      title: 'Продуктовый аналитик',
      city: 'Москва',
      orgUnitId: hq.id,
      candidateProfileId: profileAnalyst.id,
      funnelId: funnel2.id,
      description: 'Аналитика продуктовых метрик',
    },
  });

  const stageNew = funnel1.stages.find((s) => s.code === 'NEW')!;
  const stagePhone = funnel1.stages.find((s) => s.code === 'PHONE')!;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { applyDemoCandidates } = require('./demo-enrich.cjs');
  await applyDemoCandidates(prisma, { hiringRequestByVacancyId: { [vacancy.id]: request.id } });

  const categories = [
    { name: 'Приоритет', allowMultiple: false, tags: ['Горячий', 'Тёплый', 'Холодный'] },
    { name: 'Навыки', allowMultiple: true, tags: ['Excel', '1С', 'Водительские права', 'Английский'] },
    { name: 'Статус работы', allowMultiple: false, tags: ['В поиске', 'Рассматривает', 'Не интересует'] },
  ];
  for (const cat of categories) {
    await prisma.tagCategory.create({
      data: {
        name: cat.name,
        allowMultiple: cat.allowMultiple,
        tags: { create: cat.tags.map((name) => ({ name })) },
      },
    });
  }

  const dicts = [
    { code: 'cities', name: 'Города', items: ['Норильск', 'Москва', 'Санкт-Петербург', 'Красноярск'] },
    { code: 'rejection_reasons', name: 'Причины отказа', items: ['Не подходит опыт', 'Зарплатные ожидания', 'Самоотказ', 'Не прошёл СБ'] },
    { code: 'employment_types', name: 'Типы занятости', items: ['Полная', 'Частичная', 'Вахта', 'Подряд'] },
    { code: 'education', name: 'Образование', items: ['Среднее', 'Среднее специальное', 'Высшее', 'MBA'] },
    { code: 'languages', name: 'Языки', items: ['Русский', 'Английский', 'Китайский'] },
    { code: 'departments', name: 'Подразделения', items: ['Производство', 'IT', 'HR', 'Логистика', 'Финансы'] },
    { code: 'grades', name: 'Грейды', items: ['Junior', 'Middle', 'Senior', 'Lead', 'Рабочий'] },
  ];
  for (const d of dicts) {
    await prisma.dictionary.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: {
        code: d.code,
        name: d.name,
        items: {
          create: d.items.map((label, i) => ({
            value: label.toLowerCase().replace(/\s+/g, '_'),
            label,
            sortOrder: i,
          })),
        },
      },
    });
  }

  const sources = [
    { code: 'HH', name: 'HeadHunter', isPrimary: true },
    { code: 'SJ', name: 'SuperJob', isPrimary: true },
    { code: 'AVITO', name: 'Avito', isPrimary: true },
    { code: 'REFERRAL', name: 'Рекомендация', isPrimary: false },
    { code: 'CAREER_SITE', name: 'Карьерный сайт', isPrimary: false },
  ];
  for (const s of sources) {
    await prisma.source.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });
  }

  await prisma.publicationTemplate.create({
    data: {
      name: 'Стандартный шаблон HH',
      board: 'HH',
      body: { template: 'default', pay: true },
    },
  });

  const qTest = await prisma.questionnaire.create({
    data: {
      name: 'Базовый тест компетенций',
      type: 'TEST',
      schema: {
        questions: [
          { id: 'q1', text: 'Опыт работы в отрасли (лет)?', type: 'number' },
          { id: 'q2', text: 'Готовы к вахте?', type: 'boolean' },
        ],
      },
    },
  });
  const qVideo = await prisma.questionnaire.create({
    data: {
      name: 'Видеоинтервью: самопрезентация',
      type: 'VIDEO',
      schema: { prompts: ['Расскажите о себе', 'Почему хотите к нам?'] },
    },
  });
  await prisma.questionnaire.create({
    data: {
      name: 'Домашнее задание: кейс',
      type: 'HOMEWORK',
      schema: { task: 'Опишите план адаптации на участке за 30 дней' },
    },
  });

  await prisma.assessmentScenario.create({
    data: {
      name: 'Автотест после телефонного интервью',
      funnelStageId: stagePhone.id,
      questionnaireId: qTest.id,
    },
  });
  await prisma.assessmentScenario.create({
    data: {
      name: 'Видео на этапе Новый',
      funnelStageId: stageNew.id,
      questionnaireId: qVideo.id,
    },
  });

  const emailTemplates = [
    { code: 'REQUEST_PENDING', subject: 'Заявка на согласовании', body: '<p>Заявка {{title}} ожидает согласования.</p>' },
    { code: 'REQUEST_APPROVED', subject: 'Заявка согласована', body: '<p>Заявка {{title}} согласована HR BP.</p>' },
    { code: 'REQUEST_REJECTED', subject: 'Заявка отклонена', body: '<p>Заявка {{title}} отклонена.</p>' },
    { code: 'CANDIDATE_STAGE', subject: 'Смена этапа кандидата', body: '<p>Кандидат {{name}} переведён на этап {{stage}}.</p>' },
    { code: 'OFFER_SENT', subject: 'Вам направлен оффер', body: '<p>Здравствуйте, {{name}}! Перейдите по ссылке: {{link}}</p>' },
    { code: 'OFFER_ACCEPTED', subject: 'Оффер принят', body: '<p>Кандидат {{name}} принял оффер.</p>' },
    { code: 'OFFER_DECLINED', subject: 'Оффер отклонён', body: '<p>Кандидат {{name}} отклонил оффер.</p>' },
    { code: 'CHECK_ASSIGNED', subject: 'Назначена проверка', body: '<p>Вам назначена проверка по кандидату {{name}}.</p>' },
    { code: 'CHECK_RESULT', subject: 'Результат проверки', body: '<p>Проверка по кандидату {{name}}: {{status}}.</p>' },
    { code: 'PDN_REQUEST', subject: 'Согласие на обработку ПДн', body: '<p>Просим дать согласие на обработку персональных данных: {{link}}</p>' },
    { code: 'INTERVIEW_INVITE', subject: 'Приглашение на интервью', body: '<p>{{name}}, приглашаем на интервью {{datetime}}.</p>' },
    { code: 'REJECT_CANDIDATE', subject: 'Решение по вашей кандидатуре', body: '<p>{{name}}, к сожалению, мы не продолжаем процесс.</p>' },
    { code: 'TASK_ASSIGNED', subject: 'Новая задача', body: '<p>Вам назначена задача: {{title}}</p>' },
    { code: 'VACANCY_PUBLISHED', subject: 'Вакансия опубликована', body: '<p>Вакансия {{title}} опубликована на {{board}}.</p>' },
    { code: 'ASSESSMENT_INVITE', subject: 'Приглашение к оценке', body: '<p>{{name}}, пройдите оценку: {{link}}</p>' },
    { code: 'WELCOME', subject: 'Добро пожаловать в ATS', body: '<p>Ваш аккаунт создан. Логин: {{email}}</p>' },
    { code: 'PASSWORD_RESET', subject: 'Сброс пароля', body: '<p>Ссылка для сброса: {{link}}</p>' },
    { code: 'OFFER_MANAGER', subject: 'Оффер на согласовании', body: '<p>Оффер для {{name}} ожидает вашего решения.</p>' },
    { code: 'HIRE_READY', subject: 'Кандидат к оформлению', body: '<p>{{name}} готов к оформлению.</p>' },
    { code: 'FEEDBACK_REQUEST', subject: 'Запрос обратной связи', body: '<p>Оставьте обратную связь по кандидату {{name}}: {{link}}</p>' },
    { code: 'DUPLICATE_FOUND', subject: 'Найден дубликат', body: '<p>При создании кандидата найден возможный дубликат.</p>' },
    { code: 'REQUEST_PAUSED', subject: 'Заявка приостановлена', body: '<p>Заявка {{title}} приостановлена.</p>' },
    { code: 'REQUEST_CLOSED', subject: 'Заявка закрыта', body: '<p>Заявка {{title}} закрыта.</p>' },
  ];
  const whatsappTemplates = [
    { code: 'WA_FIRST_CONTACT', subject: 'Первый контакт', body: 'Здравствуйте, {{firstName}}! Меня зовут {{recruiter}}, {{company}}. Мы получили ваш отклик на вакансию «{{vacancy}}». Удобно обсудить детали?' },
    { code: 'WA_INTERVIEW_INVITE', subject: 'Приглашение на собеседование', body: 'Здравствуйте, {{firstName}}! Приглашаем вас на собеседование по вакансии «{{vacancy}}» {{datetime}}. Подтвердите, пожалуйста, что вам удобно.' },
    { code: 'WA_REMINDER', subject: 'Напоминание о встрече', body: '{{firstName}}, напоминаем о встрече {{datetime}} по вакансии «{{vacancy}}». Ждём вас!' },
    { code: 'WA_DOCUMENTS', subject: 'Документы для оформления', body: '{{firstName}}, для оформления возьмите с собой: паспорт, СНИЛС, ИНН, трудовую книжку (если есть) и реквизиты банковской карты.' },
    { code: 'WA_REJECT', subject: 'Отказ', body: '{{firstName}}, спасибо за интерес к вакансии «{{vacancy}}». К сожалению, сейчас мы не готовы продолжить. Желаем удачи в поиске!' },
  ].map((t) => ({ ...t, channel: 'WHATSAPP' }));
  for (const t of [...emailTemplates, ...whatsappTemplates]) {
    await prisma.notificationTemplate.upsert({
      where: { code: t.code },
      update: {},
      create: t,
    });
  }

  await prisma.pdnDocument.upsert({
    where: { type: 'POLICY' },
    update: {},
    create: {
      type: 'POLICY',
      title: 'Политика обработки персональных данных',
      content: 'ООО «LogHR» обрабатывает персональные данные кандидатов в соответствии с 152-ФЗ.',
    },
  });
  await prisma.pdnDocument.upsert({
    where: { type: 'CONSENT' },
    update: {},
    create: {
      type: 'CONSENT',
      title: 'Согласие на обработку персональных данных',
      content: 'Я даю согласие на обработку моих персональных данных в целях трудоустройства.',
    },
  });

  const existingBrand = await prisma.branding.findFirst();
  if (existingBrand) {
    await prisma.branding.update({
      where: { id: existingBrand.id },
      data: { companyName: 'ТАЙМЫР ИНВЕСТ', primaryColor: '#0a4ea3', secondaryColor: '#1ea64a' },
    });
  } else {
    await prisma.branding.create({
      data: { companyName: 'ТАЙМЫР ИНВЕСТ', primaryColor: '#0a4ea3', secondaryColor: '#1ea64a' },
    });
  }

  const openTasks = await prisma.task.count({ where: { title: { contains: 'Смирнов' } } });
  if (!openTasks) {
    await prisma.task.create({
      data: {
        title: 'Провести телефонное интервью: Смирнов К.',
        assigneeId: userMap.RECRUITER,
        createdById: userMap.RECRUITMENT_LEAD,
        hiringRequestId: request.id,
        stageId: stagePhone.id,
      },
    });
  }

  console.log('Seed complete.');
  console.log('Logins (password: admin123):');
  users.forEach((u) => console.log(`  ${u.email} — ${u.role}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
