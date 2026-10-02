export enum SystemRole {
  ADMIN = 'ADMIN',
  HR_BP = 'HR_BP',
  RECRUITMENT_LEAD = 'RECRUITMENT_LEAD',
  HIRING_MANAGER = 'HIRING_MANAGER',
  RECRUITER = 'RECRUITER',
  SECURITY = 'SECURITY',
}

export enum HiringRequestStatus {
  NEW = 'NEW',
  PENDING_HR_BP = 'PENDING_HR_BP',
  APPROVED_HR_BP = 'APPROVED_HR_BP',
  REJECTED_HR_BP = 'REJECTED_HR_BP',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  CLOSED = 'CLOSED',
}

export const HIRING_REQUEST_TRANSITIONS: Record<HiringRequestStatus, HiringRequestStatus[]> = {
  [HiringRequestStatus.NEW]: [HiringRequestStatus.PENDING_HR_BP, HiringRequestStatus.CANCELLED],
  [HiringRequestStatus.PENDING_HR_BP]: [
    HiringRequestStatus.APPROVED_HR_BP,
    HiringRequestStatus.REJECTED_HR_BP,
  ],
  [HiringRequestStatus.APPROVED_HR_BP]: [
    HiringRequestStatus.IN_PROGRESS,
    HiringRequestStatus.CANCELLED,
  ],
  [HiringRequestStatus.REJECTED_HR_BP]: [HiringRequestStatus.NEW, HiringRequestStatus.CANCELLED],
  [HiringRequestStatus.IN_PROGRESS]: [
    HiringRequestStatus.PAUSED,
    HiringRequestStatus.CLOSED,
    HiringRequestStatus.CANCELLED,
  ],
  [HiringRequestStatus.PAUSED]: [
    HiringRequestStatus.IN_PROGRESS,
    HiringRequestStatus.CANCELLED,
  ],
  [HiringRequestStatus.CANCELLED]: [],
  [HiringRequestStatus.CLOSED]: [],
};

export const HIRING_REQUEST_STATUS_LABELS: Record<HiringRequestStatus, string> = {
  [HiringRequestStatus.NEW]: 'Новая',
  [HiringRequestStatus.PENDING_HR_BP]: 'На согласовании HR BP',
  [HiringRequestStatus.APPROVED_HR_BP]: 'Согласована HR BP',
  [HiringRequestStatus.REJECTED_HR_BP]: 'Отклонена HR BP',
  [HiringRequestStatus.IN_PROGRESS]: 'В работе',
  [HiringRequestStatus.PAUSED]: 'Приостановлена',
  [HiringRequestStatus.CANCELLED]: 'Отменена',
  [HiringRequestStatus.CLOSED]: 'Закрыта',
};

export enum OfferStatus {
  DRAFT = 'DRAFT',
  PENDING_MANAGER = 'PENDING_MANAGER',
  APPROVED_MANAGER = 'APPROVED_MANAGER',
  REJECTED_MANAGER = 'REJECTED_MANAGER',
  SENT_TO_CANDIDATE = 'SENT_TO_CANDIDATE',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  [OfferStatus.DRAFT]: 'Формирование оффера',
  [OfferStatus.PENDING_MANAGER]: 'Оффер на согласовании руководителем',
  [OfferStatus.APPROVED_MANAGER]: 'Оффер согласован руководителем',
  [OfferStatus.REJECTED_MANAGER]: 'Оффер отклонен руководителем',
  [OfferStatus.SENT_TO_CANDIDATE]: 'Оффер направлен кандидату',
  [OfferStatus.ACCEPTED]: 'Оффер принят кандидатом',
  [OfferStatus.DECLINED]: 'Оффер отклонен кандидатом',
};

export enum CheckType {
  SECURITY = 'SECURITY',
  HIRE_REQUEST = 'HIRE_REQUEST',
  FEEDBACK = 'FEEDBACK',
}

export enum CheckStatus {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum CandidateAddType {
  MANUAL = 'MANUAL',
  RESPONSE = 'RESPONSE',
  SEARCH = 'SEARCH',
  CALL = 'CALL',
  VISIT = 'VISIT',
}

export enum JobBoard {
  HH = 'HH',
  SUPERJOB = 'SUPERJOB',
  AVITO = 'AVITO',
  ZARPLATA = 'ZARPLATA',
  RABOTA = 'RABOTA',
  TRUDVSEM = 'TRUDVSEM',
  MANUAL = 'MANUAL',
}

export enum VacancyVacancyLinkMode {
  PROFILE_CITY = 'PROFILE_CITY',
  PROFILE_ORG_UNIT = 'PROFILE_ORG_UNIT',
}

export enum QuestionnaireType {
  TEST = 'TEST',
  VIDEO = 'VIDEO',
  HOMEWORK = 'HOMEWORK',
}

export enum TaskStatus {
  OPEN = 'OPEN',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export const ROLE_LABELS: Record<SystemRole, string> = {
  [SystemRole.ADMIN]: 'Администратор компании',
  [SystemRole.HR_BP]: 'HR BP',
  [SystemRole.RECRUITMENT_LEAD]: 'Руководитель направления подбора',
  [SystemRole.HIRING_MANAGER]: 'Нанимающий менеджер',
  [SystemRole.RECRUITER]: 'Рекрутер',
  [SystemRole.SECURITY]: 'Сотрудник СБ',
};

/** Funnel.transitions JSON: roles allowed to move a candidate INTO a stage, keyed by stage code. */
export interface FunnelTransitions {
  stageRoles?: Record<string, string[]>;
}

/** Stages without a rule are open to everyone; ADMIN may always move. */
export function stageAllowedRoles(transitions: unknown, stageCode: string): string[] | null {
  const roles = (transitions as FunnelTransitions | null)?.stageRoles?.[stageCode];
  return Array.isArray(roles) && roles.length ? roles : null;
}

export function canMoveToStage(transitions: unknown, stageCode: string, role: string): boolean {
  if (role === SystemRole.ADMIN) return true;
  const roles = stageAllowedRoles(transitions, stageCode);
  return !roles || roles.includes(role);
}

export const CHECK_TYPE_LABELS: Record<string, string> = {
  SECURITY: 'Проверка СБ',
  HIRE_REQUEST: 'Запрос на найм',
  FEEDBACK: 'Обратная связь',
};

export const CHECK_STATUS_LABELS: Record<string, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  APPROVED: 'Одобрена',
  REJECTED: 'Отклонена',
  CANCELLED: 'Отменена',
};

export const JOB_BOARD_LABELS: Record<string, string> = {
  HH: 'HeadHunter',
  SUPERJOB: 'SuperJob',
  AVITO: 'Авито Работа',
  ZARPLATA: 'Зарплата.ру',
  RABOTA: 'Работа.ру',
  TRUDVSEM: 'Работа России',
  MANUAL: 'Добавлен вручную',
  CAREER_SITE: 'Карьерный сайт',
};

export const CANDIDATE_ADD_TYPE_LABELS: Record<string, string> = {
  MANUAL: 'Вручную',
  RESPONSE: 'Отклик',
  SEARCH: 'Поиск',
  CALL: 'Звонок',
  VISIT: 'Личный визит',
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
};

export const PUBLICATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликована',
  ARCHIVED: 'В архиве',
  FAILED: 'Ошибка',
};

export const QUESTIONNAIRE_TYPE_LABELS: Record<string, string> = {
  TEST: 'Тест',
  VIDEO: 'Видеоинтервью',
  HOMEWORK: 'Домашнее задание',
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ожидает прохождения',
  COMPLETED: 'Пройдено',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Открыта',
  DONE: 'Выполнена',
  CANCELLED: 'Отменена',
};

export const PDN_DOC_TYPE_LABELS: Record<string, string> = {
  POLICY: 'Политика обработки ПДн',
  CONSENT: 'Согласие на обработку ПДн',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  email: 'Email',
  whatsapp: 'WhatsApp',
};

export const NOTIFICATION_STATUS_LABELS: Record<string, string> = {
  SENT: 'Отправлено',
  MOCKED: 'Сохранено без отправки (почта не подключена)',
  FAILED: 'Ошибка',
  SKIPPED: 'Пропущено',
  PENDING: 'В очереди',
};

export const CUSTOM_FIELD_ENTITY_LABELS: Record<string, string> = {
  ORG_UNIT: 'Орг. единица',
  CANDIDATE_PROFILE: 'Профиль кандидата',
  VACANCY: 'Вакансия',
  HIRING_REQUEST: 'Заявка',
  CANDIDATE: 'Кандидат',
};

export const CUSTOM_FIELD_TYPE_LABELS: Record<string, string> = {
  string: 'Строка',
  number: 'Число',
  boolean: 'Да/Нет',
  select: 'Список',
};

export function ruLabel(map: Record<string, string>, value?: string | null, fallback = '—'): string {
  if (!value) return fallback;
  return map[value] ?? value;
}

export const FUNNEL_1_STAGES = [
  { code: 'NEW', name: 'Новый', order: 1 },
  { code: 'PHONE', name: 'Телефонное интервью', order: 2 },
  { code: 'RECRUITER', name: 'Интервью с рекрутером', order: 3 },
  { code: 'MANAGER', name: 'Интервью с руководителем', order: 4 },
  { code: 'ONBOARDING', name: 'Оформление', order: 5 },
  { code: 'OTHER', name: 'Другие', order: 6 },
] as const;

export const FUNNEL_2_STAGES = [
  { code: 'NEW', name: 'Новый', order: 1 },
  { code: 'PHONE', name: 'Телефонное интервью', order: 2 },
  { code: 'RESUME', name: 'Оценка резюме', order: 3 },
  { code: 'TEST', name: 'Тестовое задание', order: 4 },
  { code: 'MANAGER', name: 'Интервью с руководителем', order: 5 },
  { code: 'OFFER', name: 'Оффер', order: 6 },
  { code: 'ONBOARDING', name: 'Оформление', order: 7 },
  { code: 'OTHER', name: 'Другие', order: 8 },
] as const;

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles: readonly SystemRole[] | SystemRole[];
  /** Ключ счётчика непросмотренных в шапке меню */
  badge?: 'reserveUnviewed' | 'messengersUnread';
};

export const NAV_GROUPS: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: 'main',
    label: 'Основное',
    items: [
      { href: '/candidates', label: 'Витрина кандидатов', icon: 'users', roles: Object.values(SystemRole) },
      { href: '/reserve', label: 'Резерв по вакансиям', icon: 'inbox', roles: Object.values(SystemRole), badge: 'reserveUnviewed' },
      { href: '/vacancies', label: 'Вакансии', icon: 'briefcase', roles: Object.values(SystemRole) },
      { href: '/requests', label: 'Заявки', icon: 'file', roles: Object.values(SystemRole) },
      { href: '/org-units', label: 'Орг единицы', icon: 'building', roles: [SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD] },
      { href: '/demands', label: 'Потребности', icon: 'demand', roles: [SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD, SystemRole.HIRING_MANAGER] },
      { href: '/profiles', label: 'Профили кандидатов', icon: 'profile', roles: [SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD] },
      { href: '/tasks', label: 'Мои задачи', icon: 'check', roles: Object.values(SystemRole) },
    ],
  },
  {
    id: 'tools',
    label: 'Инструменты',
    items: [
      { href: '/assessments', label: 'Опросники', icon: 'quiz', roles: [SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.HR_BP] },
      { href: '/assessments?tab=scenarios', label: 'Сценарии', icon: 'flow', roles: [SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.HR_BP] },
      { href: '/candidates?view=search', label: 'Поиск кандидатов', icon: 'search', roles: Object.values(SystemRole) },
      { href: '/offers', label: 'Офферы', icon: 'offer', roles: [SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD, SystemRole.RECRUITER, SystemRole.HIRING_MANAGER] },
      { href: '/checks', label: 'Проверки', icon: 'shield', roles: [SystemRole.ADMIN, SystemRole.SECURITY, SystemRole.RECRUITER, SystemRole.HR_BP] },
      { href: '/messengers', label: 'Мессенджеры', icon: 'comment', roles: Object.values(SystemRole), badge: 'messengersUnread' },
      { href: '/admin?tab=import', label: 'Импорт и экспорт', icon: 'import', roles: [SystemRole.ADMIN, SystemRole.HR_BP] },
    ],
  },
  {
    id: 'boards',
    label: 'Работные сайты',
    items: [
      { href: '/publications', label: 'Аккаунты', icon: 'globe', roles: [SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD] },
      { href: '/publications?tab=templates', label: 'Шаблоны публикаций', icon: 'template', roles: [SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD] },
      { href: '/publications?tab=search', label: 'Автопоиски', icon: 'search', roles: [SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD] },
      { href: '/publications?tab=auto', label: 'Авторазмещения', icon: 'globe', roles: [SystemRole.ADMIN, SystemRole.RECRUITER, SystemRole.RECRUITMENT_LEAD] },
    ],
  },
  {
    id: 'settings',
    label: 'Настройки',
    items: [
      { href: '/admin', label: 'Пользователи и роли', icon: 'settings', roles: [SystemRole.ADMIN] },
      { href: '/team', label: 'Моя команда', icon: 'users', roles: [SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD, SystemRole.HR_BP] },
      { href: '/funnels', label: 'Воронки', icon: 'flow', roles: [SystemRole.ADMIN, SystemRole.RECRUITMENT_LEAD] },
      { href: '/visibility', label: 'Профили видимости', icon: 'eye', roles: [SystemRole.ADMIN] },
      { href: '/custom-fields', label: 'Дополнительные поля', icon: 'list', roles: [SystemRole.ADMIN] },
      { href: '/dictionaries', label: 'Справочники', icon: 'list', roles: [SystemRole.ADMIN, SystemRole.HR_BP] },
      { href: '/tags', label: 'Теги', icon: 'star', roles: [SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITER] },
      { href: '/notifications', label: 'Шаблоны писем', icon: 'template', roles: [SystemRole.ADMIN, SystemRole.HR_BP] },
      { href: '/pdn', label: 'ПДн', icon: 'shield', roles: [SystemRole.ADMIN, SystemRole.HR_BP] },
      { href: '/reports', label: 'Отчёты', icon: 'chart', roles: [SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD] },
      { href: '/dashboard', label: 'Рабочий стол', icon: 'home', roles: Object.values(SystemRole) },
    ],
  },
];

/** @deprecated use NAV_GROUPS */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
