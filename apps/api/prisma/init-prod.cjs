// Idempotent production bootstrap: reference data + first ADMIN. No demo candidates, vacancies or users.
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... node prisma/init-prod.cjs
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { FUNNEL_1_STAGES, FUNNEL_2_STAGES } = require('@skillaz/shared');

const prisma = new PrismaClient();

const VISIBILITY_PROFILES = [
  { code: 'HIRING_MANAGER', name: 'Нанимающий менеджер', rules: { scope: 'own_org' } },
  { code: 'RECRUITMENT_LEAD', name: 'Руководитель направления подбора', rules: { scope: 'all' } },
  { code: 'RECRUITER', name: 'Рекрутер', rules: { scope: 'assigned' } },
  { code: 'HR_BP', name: 'HR BP', rules: { scope: 'all' } },
  { code: 'SECURITY', name: 'Сотрудник СБ', rules: { scope: 'checks' } },
];

const PROCESS_ROLES = [
  { code: 'REQUEST_OWNER', name: 'Владелец заявки', objectType: 'HiringRequest', rules: { field: 'hiringManagerId' } },
  { code: 'RECRUITER_OWNER', name: 'Рекрутер заявки', objectType: 'HiringRequest', rules: { field: 'recruiterId' } },
  { code: 'ORG_HEAD', name: 'Руководитель орг. единицы', objectType: 'OrgUnit', rules: {} },
  { code: 'VACANCY_OWNER', name: 'Владелец вакансии', objectType: 'Vacancy', rules: {} },
  { code: 'CHECK_ASSIGNEE', name: 'Исполнитель проверки', objectType: 'Check', rules: { field: 'assigneeId' } },
  { code: 'DEMAND_OWNER', name: 'Владелец потребности', objectType: 'Demand', rules: {} },
];

const FUNNELS = [
  { code: 'STANDARD_6', name: 'Стандартная воронка (6 этапов)', stages: FUNNEL_1_STAGES },
  { code: 'EXTENDED_8', name: 'Расширенная воронка (8 этапов)', stages: FUNNEL_2_STAGES },
];

const DICTIONARIES = [
  { code: 'rejection_reasons', name: 'Причины отказа', items: ['Не подходит опыт', 'Зарплатные ожидания', 'Самоотказ', 'Не прошёл СБ'] },
  { code: 'employment_types', name: 'Типы занятости', items: ['Полная', 'Частичная', 'Вахта', 'Подряд'] },
  { code: 'education', name: 'Образование', items: ['Среднее', 'Среднее специальное', 'Высшее', 'MBA'] },
  { code: 'languages', name: 'Языки', items: ['Русский', 'Английский', 'Китайский'] },
  { code: 'grades', name: 'Грейды', items: ['Junior', 'Middle', 'Senior', 'Lead', 'Рабочий'] },
];

const SOURCES = [
  { code: 'HH', name: 'HeadHunter', isPrimary: true },
  { code: 'SJ', name: 'SuperJob', isPrimary: true },
  { code: 'AVITO', name: 'Avito', isPrimary: true },
  { code: 'REFERRAL', name: 'Рекомендация', isPrimary: false },
  { code: 'CAREER_SITE', name: 'Карьерный сайт', isPrimary: false },
];

const EMAIL_TEMPLATES = [
  { code: 'REQUEST_PENDING', subject: 'Заявка на согласовании', body: '<p>Заявка {{title}} ожидает согласования.</p>' },
  { code: 'REQUEST_APPROVED', subject: 'Заявка согласована', body: '<p>Заявка {{title}} согласована HR BP.</p>' },
  { code: 'REQUEST_REJECTED', subject: 'Заявка отклонена', body: '<p>Заявка {{title}} отклонена.</p>' },
  { code: 'CANDIDATE_STAGE', subject: 'Смена этапа кандидата', body: '<p>Кандидат {{name}} переведён на этап {{stage}}.</p>' },
  { code: 'OFFER_SENT', subject: 'Вам направлен оффер', body: '<p>Здравствуйте, {{name}}! Перейдите по ссылке: {{link}}</p>' },
  { code: 'OFFER_ACCEPTED', subject: 'Оффер принят', body: '<p>Кандидат {{name}} принял оффер.</p>' },
  { code: 'CHECK_ASSIGNED', subject: 'Назначена проверка', body: '<p>Вам назначена проверка по кандидату {{name}}.</p>' },
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

// Plain text for wa.me deep links: {{firstName}} {{vacancy}} {{city}} {{datetime}} {{recruiter}} {{company}}
const WHATSAPP_TEMPLATES = [
  { code: 'WA_FIRST_CONTACT', subject: 'Первый контакт', body: 'Здравствуйте, {{firstName}}! Меня зовут {{recruiter}}, {{company}}. Мы получили ваш отклик на вакансию «{{vacancy}}». Удобно обсудить детали?' },
  { code: 'WA_INTERVIEW_INVITE', subject: 'Приглашение на собеседование', body: 'Здравствуйте, {{firstName}}! Приглашаем вас на собеседование по вакансии «{{vacancy}}» {{datetime}}. Подтвердите, пожалуйста, что вам удобно.' },
  { code: 'WA_REMINDER', subject: 'Напоминание о встрече', body: '{{firstName}}, напоминаем о встрече {{datetime}} по вакансии «{{vacancy}}». Ждём вас!' },
  { code: 'WA_DOCUMENTS', subject: 'Документы для оформления', body: '{{firstName}}, для оформления возьмите с собой: паспорт, СНИЛС, ИНН, трудовую книжку (если есть) и реквизиты банковской карты.' },
  { code: 'WA_REJECT', subject: 'Отказ', body: '{{firstName}}, спасибо за интерес к вакансии «{{vacancy}}». К сожалению, сейчас мы не готовы продолжить. Желаем удачи в поиске!' },
].map((t) => ({ ...t, channel: 'WHATSAPP' }));

async function main() {
  const brand = process.env.BRAND_NAME || 'ТАЙМЫР ИНВЕСТ';

  for (const vp of VISIBILITY_PROFILES) {
    await prisma.visibilityProfile.upsert({ where: { code: vp.code }, update: {}, create: vp });
  }
  for (const pr of PROCESS_ROLES) {
    await prisma.processRole.upsert({ where: { code: pr.code }, update: {}, create: pr });
  }
  for (const f of FUNNELS) {
    await prisma.funnel.upsert({
      where: { code: f.code },
      update: {},
      create: {
        code: f.code,
        name: f.name,
        stages: {
          create: f.stages.map((s) => ({ code: s.code, name: s.name, order: s.order, isFinal: s.code === 'ONBOARDING' })),
        },
      },
    });
  }
  for (const d of DICTIONARIES) {
    await prisma.dictionary.upsert({
      where: { code: d.code },
      update: {},
      create: {
        code: d.code,
        name: d.name,
        items: {
          create: d.items.map((label, i) => ({ value: label.toLowerCase().replace(/\s+/g, '_'), label, sortOrder: i })),
        },
      },
    });
  }
  for (const s of SOURCES) {
    await prisma.source.upsert({ where: { code: s.code }, update: {}, create: s });
  }
  for (const t of [...EMAIL_TEMPLATES, ...WHATSAPP_TEMPLATES]) {
    await prisma.notificationTemplate.upsert({ where: { code: t.code }, update: {}, create: t });
  }
  await prisma.pdnDocument.upsert({
    where: { type: 'POLICY' },
    update: {},
    create: {
      type: 'POLICY',
      title: 'Политика обработки персональных данных',
      content: `${brand} обрабатывает персональные данные кандидатов в соответствии с 152-ФЗ.`,
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
  if (!(await prisma.branding.findFirst())) {
    await prisma.branding.create({
      data: { companyName: brand, primaryColor: process.env.BRAND_PRIMARY_COLOR || '#0a4ea3', secondaryColor: '#1ea64a' },
    });
  } else {
    await prisma.branding.updateMany({
      data: { companyName: brand, primaryColor: process.env.BRAND_PRIMARY_COLOR || '#0a4ea3', secondaryColor: '#1ea64a' },
    });
  }

  const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (admins > 0) {
    console.log('[init-prod] reference data ok, ADMIN already exists');
    return;
  }
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 10) {
    console.warn('[init-prod] no ADMIN in DB: set ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars) in .env and redeploy');
    return;
  }
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      firstName: process.env.ADMIN_FIRST_NAME || 'Администратор',
      lastName: process.env.ADMIN_LAST_NAME || brand,
      role: 'ADMIN',
    },
  });
  console.log(`[init-prod] ADMIN created: ${email}. Remove ADMIN_PASSWORD from .env after first login.`);
}

main()
  .catch((e) => {
    console.error('[init-prod] failed', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
