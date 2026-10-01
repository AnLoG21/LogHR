'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select } from '@/components/ui';

export type CandidateFilterState = {
  search: string;
  vacancyId: string;
  orgUnitId: string;
  requestId: string;
  sort: string;
  stageIds: string[];
  excludeStageIds: string[];
  interviewToday: boolean;
  interviewTomorrow: boolean;
  favoritesOnly: boolean;
  trackedOnly: boolean;
  sources: string[];
  addTypes: string[];
  salaryFrom: string;
  salaryTo: string;
  hideWithoutSalary: boolean;
  ageFrom: string;
  ageTo: string;
  hideWithoutAge: boolean;
  gender: string;
  willingToRelocate: boolean;
  lastJobBucket: string;
  employmentType: string;
  workSchedule: string;
  resumeUpdatedFrom: string;
  resumeUpdatedTo: string;
  meetingType: string;
  meetingFrom: string;
  meetingTo: string;
  tagIds: string[];
  tagAssignedFrom: string;
  tagAssignedTo: string;
  assigneeId: string;
  assigneeRole: string;
  checkStatus: string[];
  offerStatus: string[];
  consentType: string;
  hasConsent: string;
  scoreFrom: string;
  scoreTo: string;
};

export const emptyFilters = (): CandidateFilterState => ({
  search: '',
  vacancyId: '',
  orgUnitId: '',
  requestId: '',
  sort: 'updatedAt_desc',
  stageIds: [],
  excludeStageIds: [],
  interviewToday: false,
  interviewTomorrow: false,
  favoritesOnly: false,
  trackedOnly: false,
  sources: [],
  addTypes: [],
  salaryFrom: '',
  salaryTo: '',
  hideWithoutSalary: false,
  ageFrom: '',
  ageTo: '',
  hideWithoutAge: false,
  gender: '',
  willingToRelocate: false,
  lastJobBucket: '',
  employmentType: '',
  workSchedule: '',
  resumeUpdatedFrom: '',
  resumeUpdatedTo: '',
  meetingType: '',
  meetingFrom: '',
  meetingTo: '',
  tagIds: [],
  tagAssignedFrom: '',
  tagAssignedTo: '',
  assigneeId: '',
  assigneeRole: '',
  checkStatus: [],
  offerStatus: [],
  consentType: '',
  hasConsent: '',
  scoreFrom: '',
  scoreTo: '',
});

export function countActiveFilters(f: CandidateFilterState): number {
  let n = 0;
  if (f.search) n++;
  if (f.vacancyId) n++;
  if (f.orgUnitId) n++;
  if (f.requestId) n++;
  if (f.stageIds.length) n += f.stageIds.length;
  if (f.excludeStageIds.length) n += f.excludeStageIds.length;
  if (f.interviewToday) n++;
  if (f.interviewTomorrow) n++;
  if (f.favoritesOnly) n++;
  if (f.trackedOnly) n++;
  if (f.sources.length) n += f.sources.length;
  if (f.addTypes.length) n += f.addTypes.length;
  if (f.salaryFrom || f.salaryTo || f.hideWithoutSalary) n++;
  if (f.ageFrom || f.ageTo || f.hideWithoutAge) n++;
  if (f.gender) n++;
  if (f.willingToRelocate) n++;
  if (f.lastJobBucket) n++;
  if (f.employmentType) n++;
  if (f.workSchedule) n++;
  if (f.resumeUpdatedFrom || f.resumeUpdatedTo) n++;
  if (f.meetingType || f.meetingFrom || f.meetingTo) n++;
  if (f.tagIds.length) n += f.tagIds.length;
  if (f.tagAssignedFrom || f.tagAssignedTo) n++;
  if (f.assigneeId) n++;
  if (f.assigneeRole) n++;
  if (f.checkStatus.length) n += f.checkStatus.length;
  if (f.offerStatus.length) n += f.offerStatus.length;
  if (f.consentType || f.hasConsent) n++;
  if (f.scoreFrom || f.scoreTo) n++;
  return n;
}

export function filtersToQuery(f: CandidateFilterState): string {
  const p = new URLSearchParams({ pageSize: '50', view: 'full', sort: f.sort || 'updatedAt_desc' });
  const set = (k: string, v?: string | boolean | string[]) => {
    if (v === true) p.set(k, '1');
    else if (typeof v === 'string' && v) p.set(k, v);
    else if (Array.isArray(v) && v.length) p.set(k, v.join(','));
  };
  set('search', f.search);
  set('vacancyId', f.vacancyId);
  set('orgUnitId', f.orgUnitId);
  set('hiringRequestId', f.requestId);
  set('stageIds', f.stageIds);
  set('excludeStageIds', f.excludeStageIds);
  set('interviewToday', f.interviewToday);
  set('interviewTomorrow', f.interviewTomorrow);
  set('favoritesOnly', f.favoritesOnly);
  set('trackedOnly', f.trackedOnly);
  set('sources', f.sources);
  set('addTypes', f.addTypes);
  set('salaryFrom', f.salaryFrom);
  set('salaryTo', f.salaryTo);
  set('hideWithoutSalary', f.hideWithoutSalary);
  set('ageFrom', f.ageFrom);
  set('ageTo', f.ageTo);
  set('hideWithoutAge', f.hideWithoutAge);
  set('gender', f.gender);
  set('willingToRelocate', f.willingToRelocate);
  set('lastJobBucket', f.lastJobBucket);
  set('employmentType', f.employmentType);
  set('workSchedule', f.workSchedule);
  set('resumeUpdatedFrom', f.resumeUpdatedFrom);
  set('resumeUpdatedTo', f.resumeUpdatedTo);
  set('meetingType', f.meetingType);
  set('meetingFrom', f.meetingFrom);
  set('meetingTo', f.meetingTo);
  set('tagIds', f.tagIds);
  set('tagAssignedFrom', f.tagAssignedFrom);
  set('tagAssignedTo', f.tagAssignedTo);
  set('assigneeId', f.assigneeId);
  set('assigneeRole', f.assigneeRole);
  set('checkStatus', f.checkStatus);
  set('offerStatus', f.offerStatus);
  set('consentType', f.consentType);
  set('hasConsent', f.hasConsent);
  set('scoreFrom', f.scoreFrom);
  set('scoreTo', f.scoreTo);
  return p.toString();
}

const TABS = [
  { id: 'process', label: 'По процессу' },
  { id: 'sources', label: 'Источники' },
  { id: 'resume', label: 'По резюме' },
  { id: 'other', label: 'Остальные' },
  { id: 'rating', label: 'По рейтингу' },
  { id: 'consent', label: 'По согласиям' },
] as const;

const SOURCES = [
  { id: 'HH', label: 'HeadHunter' },
  { id: 'SUPERJOB', label: 'SuperJob' },
  { id: 'AVITO', label: 'Avito' },
  { id: 'ZARPLATA', label: 'Zarplata' },
  { id: 'MANUAL', label: 'Вручную' },
];

const ADD_TYPES = [
  { id: 'MANUAL', label: 'Вручную' },
  { id: 'RESPONSE', label: 'Отклик' },
  { id: 'SEARCH', label: 'Поиск' },
  { id: 'CALL', label: 'Звонок' },
  { id: 'VISIT', label: 'Визит' },
];

const CHECK_STATUSES = [
  { id: 'NEW', label: 'Новая' },
  { id: 'IN_PROGRESS', label: 'В работе' },
  { id: 'APPROVED', label: 'Одобрена' },
  { id: 'REJECTED', label: 'Отклонена' },
  { id: 'CANCELLED', label: 'Отменена' },
];

const OFFER_STATUSES = [
  { id: 'DRAFT', label: 'Черновик' },
  { id: 'PENDING_MANAGER', label: 'На согласовании' },
  { id: 'APPROVED_MANAGER', label: 'Согласован' },
  { id: 'SENT_TO_CANDIDATE', label: 'Отправлен кандидату' },
  { id: 'ACCEPTED', label: 'Принят' },
  { id: 'DECLINED', label: 'Отклонён' },
];

const ROLES = [
  { id: 'RECRUITER', label: 'Рекрутер' },
  { id: 'RECRUITMENT_LEAD', label: 'Рук. подбора' },
  { id: 'HIRING_MANAGER', label: 'Нанимающий' },
  { id: 'HR_BP', label: 'HR BP' },
  { id: 'ADMIN', label: 'Админ' },
];

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function Check({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer', lineHeight: 1.35 }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ marginTop: 2 }} />
      <span>{label}</span>
    </label>
  );
}

export function AdvancedFiltersModal({
  open,
  onClose,
  value,
  onApply,
  onSave,
  funnels,
  tags,
  users,
  vacancies,
  orgUnits,
  requests,
}: {
  open: boolean;
  onClose: () => void;
  value: CandidateFilterState;
  onApply: (next: CandidateFilterState) => void;
  onSave: (next: CandidateFilterState, name: string) => void;
  funnels: any[];
  tags: any[];
  users: any[];
  vacancies: any[];
  orgUnits: any[];
  requests: any[];
}) {
  const [draft, setDraft] = useState<CandidateFilterState>(value);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('process');
  const [mode, setMode] = useState<'include' | 'exclude'>('include');
  const [saveName, setSaveName] = useState('');
  const [funnelId, setFunnelId] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(value);
      setSaveName('');
    }
  }, [open, value]);

  const stages = useMemo(() => {
    const list = funnelId
      ? funnels.find((f) => f.id === funnelId)?.stages || []
      : funnels.flatMap((f) => (f.stages || []).map((s: any) => ({ ...s, funnelName: f.name })));
    return list;
  }, [funnels, funnelId]);

  const active = countActiveFilters(draft);

  const patch = (p: Partial<CandidateFilterState>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <Modal open={open} title="Отфильтровать кандидатов" onClose={onClose} wide>
      <div style={{ paddingTop: 12 }}>
        <Input
          placeholder="Поиск"
          value={draft.search}
          onChange={(e) => patch({ search: e.target.value })}
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--sk-line, #e5e7eb)', marginBottom: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: 'none',
                border: 0,
                borderBottom: tab === t.id ? '2px solid var(--sk-brand, #0d9488)' : '2px solid transparent',
                padding: '8px 12px',
                cursor: 'pointer',
                fontWeight: tab === t.id ? 700 : 500,
                fontSize: 13,
                color: tab === t.id ? 'var(--sk-ink)' : 'var(--sk-muted)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'process' ? (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Быстрые фильтры</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <Check checked={draft.interviewToday} label="Назначено интервью на сегодня" onChange={() => patch({ interviewToday: !draft.interviewToday })} />
              <Check checked={draft.favoritesOnly} label="Только избранные кандидаты" onChange={() => patch({ favoritesOnly: !draft.favoritesOnly })} />
              <Check checked={draft.interviewTomorrow} label="Интервью на завтра" onChange={() => patch({ interviewTomorrow: !draft.interviewTomorrow })} />
              <Check checked={draft.trackedOnly} label="Отслеживаемые кандидаты" onChange={() => patch({ trackedOnly: !draft.trackedOnly })} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                <button type="button" className="sk-link" style={{ background: 'none', border: 0, cursor: 'pointer', fontWeight: mode === 'include' ? 700 : 400 }} onClick={() => setMode('include')}>Все статусы</button>
                <button type="button" className="sk-link" style={{ background: 'none', border: 0, cursor: 'pointer', fontWeight: mode === 'exclude' ? 700 : 400 }} onClick={() => setMode('exclude')}>Исключая статусы</button>
              </div>
              <Select value={funnelId} onChange={(e) => setFunnelId(e.target.value)} style={{ maxWidth: 220 }}>
                <option value="">Все воронки</option>
                {funnels.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, maxHeight: 320, overflow: 'auto' }}>
              {stages.map((s: any) => {
                const selected = mode === 'include' ? draft.stageIds.includes(s.id) : draft.excludeStageIds.includes(s.id);
                return (
                  <div key={s.id} className="sk-card" style={{ padding: 10, boxShadow: 'none', border: '1px solid var(--sk-line, #e5e7eb)' }}>
                    <div style={{ fontSize: 12, color: 'var(--sk-muted)', marginBottom: 4 }}>{s.funnelName || 'Этап'}</div>
                    <Check
                      checked={selected}
                      label={s.name}
                      onChange={() => {
                        if (mode === 'include') patch({ stageIds: toggle(draft.stageIds, s.id) });
                        else patch({ excludeStageIds: toggle(draft.excludeStageIds, s.id) });
                      }}
                    />
                  </div>
                );
              })}
              {!stages.length ? <div style={{ color: 'var(--sk-muted)', fontSize: 13 }}>Нет этапов — создайте воронку</div> : null}
            </div>

            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Тип встречи</div>
                <Select value={draft.meetingType} onChange={(e) => patch({ meetingType: e.target.value })}>
                  <option value="">Любой</option>
                  <option value="PHONE">Телефон</option>
                  <option value="ONLINE">Онлайн</option>
                  <option value="OFFICE">Офис</option>
                </Select>
              </div>
              <div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Встреча с</div>
                <Input type="date" value={draft.meetingFrom} onChange={(e) => patch({ meetingFrom: e.target.value })} />
              </div>
              <div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Встреча по</div>
                <Input type="date" value={draft.meetingTo} onChange={(e) => patch({ meetingTo: e.target.value })} />
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'sources' ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Источники кандидатов</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {SOURCES.map((s) => (
                  <Check key={s.id} checked={draft.sources.includes(s.id)} label={s.label} onChange={() => patch({ sources: toggle(draft.sources, s.id) })} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Способы добавления</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {ADD_TYPES.map((s) => (
                  <Check key={s.id} checked={draft.addTypes.includes(s.id)} label={s.label} onChange={() => patch({ addTypes: toggle(draft.addTypes, s.id) })} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Теги кандидатов</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 160, overflow: 'auto' }}>
                {tags.map((t: any) => (
                  <Check key={t.id} checked={draft.tagIds.includes(t.id)} label={t.name} onChange={() => patch({ tagIds: toggle(draft.tagIds, t.id) })} />
                ))}
                {!tags.length ? <span style={{ color: 'var(--sk-muted)', fontSize: 13 }}>Тегов нет</span> : null}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <Input type="date" value={draft.tagAssignedFrom} onChange={(e) => patch({ tagAssignedFrom: e.target.value })} placeholder="Тэг с" />
                <Input type="date" value={draft.tagAssignedTo} onChange={(e) => patch({ tagAssignedTo: e.target.value })} placeholder="Тэг по" />
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Ответственные</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Select value={draft.assigneeRole} onChange={(e) => patch({ assigneeRole: e.target.value })}>
                  <option value="">Ответственная роль</option>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
                <Select value={draft.assigneeId} onChange={(e) => patch({ assigneeId: e.target.value })}>
                  <option value="">Ответственный пользователь</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'resume' ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Зарплата</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input type="number" placeholder="От" value={draft.salaryFrom} onChange={(e) => patch({ salaryFrom: e.target.value })} />
                <Input type="number" placeholder="До" value={draft.salaryTo} onChange={(e) => patch({ salaryTo: e.target.value })} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Check checked={draft.hideWithoutSalary} label="Не показывать без зарплаты" onChange={() => patch({ hideWithoutSalary: !draft.hideWithoutSalary })} />
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Резюме обновлено</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input type="date" value={draft.resumeUpdatedFrom} onChange={(e) => patch({ resumeUpdatedFrom: e.target.value })} />
                <Input type="date" value={draft.resumeUpdatedTo} onChange={(e) => patch({ resumeUpdatedTo: e.target.value })} />
              </div>
            </div>
            <Check checked={draft.willingToRelocate} label="Готов к переезду" onChange={() => patch({ willingToRelocate: !draft.willingToRelocate })} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Срок на последнем месте</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { id: 'lt1', label: 'Менее 1 года' },
                  { id: '1to3', label: '1–3 года' },
                  { id: '3to6', label: '3–6 лет' },
                  { id: 'gt6', label: 'Более 6 лет' },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="sk-btn sk-btn-outline"
                    style={{ height: 32, fontSize: 12, background: draft.lastJobBucket === b.id ? 'var(--sk-success-soft)' : undefined }}
                    onClick={() => patch({ lastJobBucket: draft.lastJobBucket === b.id ? '' : b.id })}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Возраст</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input type="number" placeholder="От" value={draft.ageFrom} onChange={(e) => patch({ ageFrom: e.target.value })} />
                <Input type="number" placeholder="До" value={draft.ageTo} onChange={(e) => patch({ ageTo: e.target.value })} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Check checked={draft.hideWithoutAge} label="Не показывать без возраста" onChange={() => patch({ hideWithoutAge: !draft.hideWithoutAge })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Select value={draft.gender} onChange={(e) => patch({ gender: e.target.value })}>
                <option value="">Пол</option>
                <option value="MALE">Мужской</option>
                <option value="FEMALE">Женский</option>
              </Select>
              <Select value={draft.employmentType} onChange={(e) => patch({ employmentType: e.target.value })}>
                <option value="">Тип занятости</option>
                <option value="FULL">Полная</option>
                <option value="PART">Частичная</option>
                <option value="PROJECT">Проект</option>
                <option value="INTERN">Стажировка</option>
              </Select>
              <Select value={draft.workSchedule} onChange={(e) => patch({ workSchedule: e.target.value })}>
                <option value="">График работы</option>
                <option value="5/2">5/2</option>
                <option value="2/2">2/2</option>
                <option value="REMOTE">Удалёнка</option>
                <option value="SHIFT">Сменный</option>
              </Select>
            </div>
          </div>
        ) : null}

        {tab === 'other' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Select value={draft.requestId} onChange={(e) => patch({ requestId: e.target.value })}>
              <option value="">Заявка на кандидата</option>
              {requests.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
            <Select value={draft.vacancyId} onChange={(e) => patch({ vacancyId: e.target.value })}>
              <option value="">Вакансия</option>
              {vacancies.map((v: any) => <option key={v.id} value={v.id}>{v.title}</option>)}
            </Select>
            <Select value={draft.orgUnitId} onChange={(e) => patch({ orgUnitId: e.target.value })}>
              <option value="">Орг. единица</option>
              {orgUnits.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Статусы проверок</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {CHECK_STATUSES.map((s) => (
                  <Check key={s.id} checked={draft.checkStatus.includes(s.id)} label={s.label} onChange={() => patch({ checkStatus: toggle(draft.checkStatus, s.id) })} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Статусы оффера</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {OFFER_STATUSES.map((s) => (
                  <Check key={s.id} checked={draft.offerStatus.includes(s.id)} label={s.label} onChange={() => patch({ offerStatus: toggle(draft.offerStatus, s.id) })} />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'rating' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Общий балл AI</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input type="number" placeholder="От" value={draft.scoreFrom} onChange={(e) => patch({ scoreFrom: e.target.value })} />
              <Input type="number" placeholder="До" value={draft.scoreTo} onChange={(e) => patch({ scoreTo: e.target.value })} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--sk-muted)' }}>Рейтинг берётся из поля aiScore на карточке кандидата (AI score / live).</p>
          </div>
        ) : null}

        {tab === 'consent' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Select value={draft.consentType} onChange={(e) => patch({ consentType: e.target.value })}>
              <option value="">Тип согласия</option>
              <option value="PDN">ПДн</option>
              <option value="MARKETING">Маркетинг</option>
              <option value="TRANSFER">Передача третьим лицам</option>
            </Select>
            <Select value={draft.hasConsent} onChange={(e) => patch({ hasConsent: e.target.value })}>
              <option value="">Наличие согласия ПДн</option>
              <option value="1">Есть</option>
              <option value="0">Нет</option>
            </Select>
          </div>
        ) : null}

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: 18,
            marginLeft: -20,
            marginRight: -20,
            marginBottom: -16,
            padding: '12px 20px',
            background: 'var(--sk-soft)',
            borderTop: '1px solid var(--sk-line, #e5e7eb)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <Button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Показать кандидатов
          </Button>
          <button type="button" className="sk-btn sk-btn-outline" onClick={() => setDraft(emptyFilters())}>
            Очистить
          </button>
          <Select value={draft.sort} onChange={(e) => patch({ sort: e.target.value })} style={{ minWidth: 180 }}>
            <option value="updatedAt_desc">Сортировка: обновлённые</option>
            <option value="createdAt_desc">Сначала новые</option>
            <option value="createdAt_asc">Сначала старые</option>
            <option value="lastName_asc">ФИО А→Я</option>
            <option value="aiScore_desc">Рейтинг ↓</option>
            <option value="salaryExpect_desc">Зарплата ↓</option>
            <option value="meetingAt_asc">Встреча ↑</option>
          </Select>
          <span style={{ fontSize: 13, color: 'var(--sk-muted)' }}>Всего применено фильтров: {active}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input placeholder="Имя пресета" value={saveName} onChange={(e) => setSaveName(e.target.value)} style={{ width: 140 }} />
            <Button
              variant="dark"
              onClick={() => {
                onSave(draft, saveName || 'Мой фильтр');
                onApply(draft);
                onClose();
              }}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
