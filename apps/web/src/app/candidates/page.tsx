'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell, Button, Card, Empty, Icon, Input, Modal, Select } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { downloadXlsx } from '@/lib/export';
import { canMoveToStage } from '@skillaz/shared';
import {
  AdvancedFiltersModal,
  CandidateFilterState,
  countActiveFilters,
  emptyFilters,
  filtersToQuery,
} from '@/components/candidate-filters';
import clsx from 'clsx';
import { CHECK_STATUS_LABELS, CHECK_TYPE_LABELS, JOB_BOARD_LABELS, ruLabel } from '@skillaz/shared';

function ageLabel(birthDate?: string | null) {
  if (!birthDate) return null;
  const y = new Date().getFullYear() - new Date(birthDate).getFullYear();
  if (y < 1 || y > 120) return null;
  const mod10 = y % 10;
  const mod100 = y % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'год' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'года' : 'лет';
  return `${y} ${word}`;
}

function stageColor(name?: string) {
  if (!name) return 'sk-status-gray';
  const n = name.toLowerCase();
  if (n.includes('оффер')) return 'sk-status-purple';
  if (n.includes('оформ') || n.includes('принят')) return 'sk-status-green';
  if (n.includes('отказ')) return 'sk-status-gray';
  if (n.includes('интервью') || n.includes('телефон')) return 'sk-status-blue';
  return 'sk-status-amber';
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={<AppShell title="Кандидаты"><div className="text-[var(--muted)]">Загрузка…</div></AppShell>}>
      <CandidatesInner />
    </Suspense>
  );
}

function CandidatesInner() {
  const sp = useSearchParams();
  const isSearchView = sp.get('view') === 'search';
  const initialRequest = sp.get('requestId') || '';
  const [filters, setFilters] = useState<CandidateFilterState>(() => ({
    ...emptyFilters(),
    requestId: initialRequest,
  }));
  const [layout, setLayout] = useState<'list' | 'kanban'>('list');
  const [showForm, setShowForm] = useState(false);
  const [stageModal, setStageModal] = useState<{ id: string; stages: any[]; transitions?: unknown; currentStageId?: string } | null>(null);
  const [nextStageId, setNextStageId] = useState('');
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkOpen, setBulkOpen] = useState<'invite' | 'reject' | null>(null);
  const [bulkDatetime, setBulkDatetime] = useState('');
  const [bulkStageId, setBulkStageId] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');
  const [visibleFields, setVisibleFields] = useState({ source: true, time: true, gender: true, checks: true });
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useMemo(() => filtersToQuery(filters), [filters]);
  const activeCount = countActiveFilters(filters);

  const { data, isLoading } = useQuery({
    queryKey: ['candidates', query],
    queryFn: () => api<any>(`/candidates?${query}`),
  });
  const vacancies = useQuery({ queryKey: ['vacancies-mini'], queryFn: () => api<any>('/vacancies?pageSize=100') });
  const orgUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=100') });
  const requests = useQuery({ queryKey: ['requests-mini'], queryFn: () => api<any>('/hiring-requests?pageSize=100') });
  const funnels = useQuery({ queryKey: ['funnels'], queryFn: () => api<any[]>('/funnels') });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api<any[]>('/tags') });
  const users = useQuery({ queryKey: ['users-mini'], queryFn: () => api<any>('/users?pageSize=100') });
  const savedFilters = useQuery({
    queryKey: ['saved-filters', 'candidates'],
    queryFn: () => api<any[]>('/filters?entity=candidates'),
  });

  const create = useMutation({
    mutationFn: (body: any) => api('/candidates', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] });
      setShowForm(false);
    },
  });

  const changeStage = useMutation({
    mutationFn: (payload?: { id: string; stageId: string }) =>
      api(`/candidates/${payload?.id || stageModal!.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stageId: payload?.stageId || nextStageId }),
      }),
    onSuccess: () => {
      setStageModal(null);
      setNextStageId('');
      setDragId(null);
      qc.invalidateQueries({ queryKey: ['candidates'] });
    },
  });

  const toggleFav = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      api(`/candidates/${id}/flags`, { method: 'PATCH', body: JSON.stringify({ isFavorite }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  });

  const saveFilter = useMutation({
    mutationFn: (payload: { name: string; filters: CandidateFilterState }) =>
      api('/filters', {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name || 'Мой фильтр',
          entity: 'candidates',
          payload: payload.filters,
        }),
      }),
    onSuccess: () => {
      setSaveFilterOpen(false);
      setFilterName('');
      qc.invalidateQueries({ queryKey: ['saved-filters'] });
    },
  });

  const bulkMail = useMutation({
    mutationFn: (payload: { action: 'invite' | 'reject'; stageId?: string; datetime?: string }) =>
      api('/notifications/bulk', {
        method: 'POST',
        body: JSON.stringify({
          candidateIds: Array.from(selected),
          templateCode: payload.action === 'invite' ? 'INTERVIEW_INVITE' : 'REJECT_CANDIDATE',
          stageId: payload.stageId || undefined,
          vars: payload.datetime ? { datetime: payload.datetime } : {},
          comment:
            payload.action === 'invite'
              ? `Массовое приглашение${payload.datetime ? ` (${payload.datetime})` : ''}`
              : 'Массовый отказ кандидату',
        }),
      }),
    onSuccess: (res: any) => {
      setBulkMsg(`Отправлено: ${res.sent}, пропущено: ${res.skipped} (нет email / ошибка)`);
      setBulkOpen(null);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['candidates'] });
    },
    onError: (e: any) => setBulkMsg(e?.message || 'Ошибка рассылки'),
  });

  const items = data?.items || [];
  const funnel = funnels.data?.[0];
  const stages = funnel?.stages || [];
  const byStage = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of stages) map.set(s.id, []);
    for (const c of items) {
      const key = c.stageId && map.has(c.stageId) ? c.stageId : stages[0]?.id;
      if (key) map.get(key)!.push(c);
    }
    return map;
  }, [items, stages]);

  function clearFilters() {
    setFilters(emptyFilters());
  }

  function applySaved(f: any) {
    const p = f.payload || {};
    setFilters({ ...emptyFilters(), ...p });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AppShell
      title={isSearchView ? 'Поиск кандидатов' : 'Кандидаты'}
      actions={
        <>
          <button className="sk-btn sk-btn-icon" title="Экспорт XLSX" type="button" onClick={() => downloadXlsx('candidates')}>
            <Icon name="xls" />
          </button>
          <Button variant="dark" onClick={() => setShowForm(true)}>
            <Icon name="plus" className="w-4 h-4" /> Добавить кандидата
          </Button>
        </>
      }
    >
      <Card className="filter-panel">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <Input
            placeholder="Поиск по ФИО, контактным данным и информации из резюме"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            style={{ flex: 1 }}
          />
          <button type="button" className="sk-link" style={{ whiteSpace: 'nowrap', background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }} onClick={() => setSaveFilterOpen(true)}>
            Сохранить фильтр
          </button>
        </div>
        <div className="filter-row filter-row-3">
          <Select value={filters.vacancyId} onChange={(e) => setFilters((f) => ({ ...f, vacancyId: e.target.value }))}>
            <option value="">Вакансия</option>
            {(vacancies.data?.items || []).map((v: any) => (
              <option key={v.id} value={v.id}>{v.title}</option>
            ))}
          </Select>
          <Select value={filters.orgUnitId} onChange={(e) => setFilters((f) => ({ ...f, orgUnitId: e.target.value }))}>
            <option value="">Орг. единица</option>
            {(orgUnits.data?.items || []).map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
          <Select value={filters.requestId} onChange={(e) => setFilters((f) => ({ ...f, requestId: e.target.value }))}>
            <option value="">Заявка</option>
            {(requests.data?.items || []).map((r: any) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </Select>
        </div>
        {(savedFilters.data || []).length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {(savedFilters.data || []).map((f: any) => (
              <button key={f.id} type="button" className="sk-btn sk-btn-outline" style={{ height: 30, fontSize: 12 }} onClick={() => applySaved(f)}>
                {f.name}
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <button type="button" className="sk-link" style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }} onClick={() => setAdvancedOpen(true)}>
            + Добавить фильтры{activeCount ? ` (${activeCount})` : '…'}
          </button>
          <button type="button" onClick={clearFilters} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 13, color: 'var(--sk-muted)' }}>
            Очистить
          </button>
        </div>
      </Card>

      <div className="filter-toolbar">
        <button
          type="button"
          className="sk-btn sk-btn-outline"
          style={{ fontSize: 13 }}
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
            setBulkMsg('');
          }}
        >
          {selectMode ? `Выбрано: ${selected.size}` : 'Выбрать несколько'}
        </button>
        {selectMode && selected.size > 0 ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setBulkDatetime('');
                setBulkStageId(stages.find((s: any) => /телефон|интервью|phone/i.test(s.name || s.code || ''))?.id || '');
                setBulkOpen('invite');
              }}
            >
              Пригласить
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setBulkDatetime('');
                setBulkStageId(stages.find((s: any) => /отказ|other|друг/i.test(s.name || s.code || ''))?.id || '');
                setBulkOpen('reject');
              }}
            >
              Отказать
            </Button>
          </>
        ) : null}
        <button type="button" className="sk-btn sk-btn-outline" style={{ fontSize: 13 }} onClick={() => setFieldsOpen(true)}>
          Настроить поля
        </button>
        <Select
          value={filters.sort}
          onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
          style={{ height: 36, maxWidth: 200, fontSize: 13 }}
        >
          <option value="updatedAt_desc">Сортировка: обновлённые</option>
          <option value="createdAt_desc">Сначала новые</option>
          <option value="lastName_asc">ФИО А→Я</option>
          <option value="aiScore_desc">Рейтинг ↓</option>
          <option value="meetingAt_asc">Встреча ↑</option>
        </Select>
        <div className="filter-toolbar-right">
          <button
            type="button"
            className={clsx('sk-btn sk-btn-icon', layout === 'list' && 'active-view')}
            style={layout === 'list' ? { background: '#e8ebef' } : undefined}
            onClick={() => setLayout('list')}
            title="Список"
          >
            <Icon name="list" />
          </button>
          <button
            type="button"
            className="sk-btn sk-btn-icon"
            style={layout === 'kanban' ? { background: '#e8ebef' } : undefined}
            onClick={() => setLayout('kanban')}
            title="Канбан"
          >
            <Icon name="kanban" />
          </button>
        </div>
      </div>

      {isLoading ? <Empty text="Загрузка…" /> : null}

      {!isLoading && layout === 'list' ? (
        <div className="candidate-list">
          {items.map((c: any) => (
            <CandidateCard
              key={c.id}
              c={c}
              selectMode={selectMode}
              selected={selected.has(c.id)}
              onToggleSelect={() => toggleSelect(c.id)}
              visibleFields={visibleFields}
              onToggleFavorite={() => toggleFav.mutate({ id: c.id, isFavorite: !c.isFavorite })}
              onChangeStatus={() => {
                const st = c.vacancy?.funnel?.stages || stages;
                setStageModal({
                  id: c.id,
                  stages: st,
                  transitions: c.vacancy?.funnel?.transitions || funnel?.transitions,
                  currentStageId: c.stageId,
                });
                setNextStageId(c.stageId || '');
              }}
            />
          ))}
          {!items.length ? <Empty text="Список пуст" /> : null}
        </div>
      ) : null}

      {!isLoading && layout === 'kanban' ? (
        <div className="kanban-board">
          {stages.map((s: any) => (
            <div
              key={s.id}
              className="kanban-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragId) return;
                if (user && !canMoveToStage(funnel?.transitions, s.code, user.role)) return;
                changeStage.mutate({ id: dragId, stageId: s.id });
              }}
            >
              <div className="kanban-col-head">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ color: 'var(--sk-muted)', fontSize: 12 }}>{byStage.get(s.id)?.length || 0}</span>
              </div>
              <div className="kanban-col-body">
                {(byStage.get(s.id) || []).map((c: any) => (
                  <div
                    key={c.id}
                    className="kanban-card"
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <Link href={`/candidates/${c.id}`} style={{ display: 'block' }} onClick={(e) => dragId && e.preventDefault()}>
                      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{fullName(c)}</div>
                      <div style={{ fontSize: 11, color: 'var(--sk-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.vacancy?.title || 'Без вакансии'}
                      </div>
                      {c.phone ? <div style={{ fontSize: 12, color: 'var(--sk-link)', marginTop: 4 }}>{c.phone}</div> : null}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <AdvancedFiltersModal
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        value={filters}
        onApply={setFilters}
        onSave={(next, name) => {
          setFilters(next);
          saveFilter.mutate({ name, filters: next });
        }}
        funnels={funnels.data || []}
        tags={
          Array.isArray(tags.data)
            ? tags.data.flatMap((cat: any) => (cat.tags ? cat.tags : [cat]))
            : (tags.data as any)?.items || []
        }
        users={(users.data?.items || users.data || []) as any[]}
        vacancies={vacancies.data?.items || []}
        orgUnits={orgUnits.data?.items || []}
        requests={requests.data?.items || []}
      />

      {bulkMsg ? (
        <div className="text-sm text-[var(--muted)]" style={{ marginBottom: 8 }}>{bulkMsg}</div>
      ) : null}

      <Modal
        open={!!bulkOpen}
        title={bulkOpen === 'invite' ? 'Массовое приглашение' : 'Массовый отказ'}
        onClose={() => setBulkOpen(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="text-sm text-[var(--muted)]">
            Кандидатов: {selected.size}. Письмо уйдёт на email (без SMTP — в лог MOCKED).
          </div>
          {bulkOpen === 'invite' ? (
            <Input
              placeholder="Дата/время интервью (подставится в письмо)"
              value={bulkDatetime}
              onChange={(e) => setBulkDatetime(e.target.value)}
            />
          ) : null}
          <Select value={bulkStageId} onChange={(e) => setBulkStageId(e.target.value)}>
            <option value="">Не менять этап</option>
            {stages.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Button
            disabled={bulkMail.isPending || !selected.size}
            onClick={() =>
              bulkMail.mutate({
                action: bulkOpen!,
                stageId: bulkStageId || undefined,
                datetime: bulkDatetime || undefined,
              })
            }
          >
            {bulkMail.isPending ? 'Отправка…' : bulkOpen === 'invite' ? 'Отправить приглашения' : 'Отправить отказы'}
          </Button>
        </div>
      </Modal>

      <Modal open={showForm} title="Новый кандидат" onClose={() => setShowForm(false)}>
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            create.mutate({
              lastName: fd.get('lastName'),
              firstName: fd.get('firstName'),
              middleName: fd.get('middleName') || undefined,
              phone: fd.get('phone') || undefined,
              email: fd.get('email') || undefined,
              vacancyId: fd.get('vacancyId') || undefined,
              source: 'MANUAL',
            });
          }}
        >
          <Input name="lastName" placeholder="Фамилия" required />
          <Input name="firstName" placeholder="Имя" required />
          <Input name="middleName" placeholder="Отчество" />
          <Input name="phone" placeholder="Телефон" />
          <Input name="email" placeholder="Email" type="email" />
          <Select name="vacancyId" defaultValue="">
            <option value="">Без вакансии</option>
            {(vacancies.data?.items || []).map((v: any) => (
              <option key={v.id} value={v.id}>{v.title}</option>
            ))}
          </Select>
          <Button type="submit" disabled={create.isPending}>Создать</Button>
        </form>
      </Modal>

      <Modal open={!!stageModal} title="Изменить статус" onClose={() => setStageModal(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select value={nextStageId} onChange={(e) => setNextStageId(e.target.value)}>
            <option value="">Выберите этап</option>
            {(stageModal?.stages || []).map((s: any) => {
              const allowed = !user || canMoveToStage(stageModal?.transitions, s.code, user.role);
              return (
                <option key={s.id} value={s.id} disabled={!allowed && s.id !== stageModal?.currentStageId}>
                  {allowed ? s.name : `🔒 ${s.name}`}
                </option>
              );
            })}
          </Select>
          <Button
            disabled={!nextStageId || changeStage.isPending}
            onClick={() => changeStage.mutate({ id: stageModal!.id, stageId: nextStageId })}
          >
            Сохранить
          </Button>
          {changeStage.error ? <div style={{ fontSize: 13, color: '#b91c1c' }}>{(changeStage.error as Error).message}</div> : null}
        </div>
      </Modal>

      <Modal open={saveFilterOpen} title="Сохранить фильтр" onClose={() => setSaveFilterOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input placeholder="Название фильтра" value={filterName} onChange={(e) => setFilterName(e.target.value)} />
          <Button disabled={saveFilter.isPending} onClick={() => saveFilter.mutate({ name: filterName, filters })}>Сохранить</Button>
        </div>
      </Modal>

      <Modal open={fieldsOpen} title="Настроить поля" onClose={() => setFieldsOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            ['source', 'Источник'],
            ['time', 'Время кандидата'],
            ['gender', 'Пол'],
            ['checks', 'Проверки'],
          ] as const).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={visibleFields[key]}
                onChange={() => setVisibleFields((v) => ({ ...v, [key]: !v[key] }))}
              />
              {label}
            </label>
          ))}
          <Button onClick={() => setFieldsOpen(false)}>Готово</Button>
        </div>
      </Modal>
    </AppShell>
  );
}

function CandidateCard({
  c,
  onChangeStatus,
  onToggleFavorite,
  selectMode,
  selected,
  onToggleSelect,
  visibleFields,
}: {
  c: any;
  onChangeStatus: () => void;
  onToggleFavorite: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  visibleFields: { source: boolean; time: boolean; gender: boolean; checks: boolean };
}) {
  const age = ageLabel(c.birthDate);
  const initials = `${(c.lastName || '?')[0]}${(c.firstName || '?')[0]}`.toUpperCase();
  const handler = c.assignee || c.recruiter;
  const handlerName = handler ? `${handler.lastName || ''} ${handler.firstName || ''}`.trim() : null;

  return (
    <Card className="candidate-card">
      <div className="candidate-card-main">
        {selectMode ? (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ marginTop: 8, marginRight: 8 }} />
        ) : null}
        <div className="candidate-avatar">
          {c.photoUrl ? <img src={c.photoUrl} alt="" /> : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={`/candidates/${c.id}`} style={{ fontSize: 16, fontWeight: 700, color: 'var(--sk-ink)' }}>
                {fullName(c)}
              </Link>
              {age ? <span style={{ color: 'var(--sk-muted)', marginLeft: 8, fontSize: 14 }}>{age}</span> : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                {c.phone ? <a href={`tel:${c.phone}`} className="sk-link" style={{ fontSize: 14 }}>{c.phone}</a> : null}
                {c.phone ? <Icon name="whatsapp" className="w-4 h-4" /> : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <Link href={`/candidates/${c.id}?edit=1`} className="sk-btn sk-btn-icon" title="Редактировать">
                <Icon name="edit" />
              </Link>
              <Link href={`/candidates/${c.id}?tab=comments`} className="sk-btn sk-btn-icon" title="Комментарий">
                <Icon name="comment" />
              </Link>
              <button
                type="button"
                className="sk-btn sk-btn-icon"
                title="В избранное"
                onClick={onToggleFavorite}
                style={c.isFavorite ? { color: '#f59e0b' } : undefined}
              >
                <Icon name="star" />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <span className={clsx('sk-status', stageColor(c.stage?.name))}>
              {c.stage?.name || 'Без статуса'}
            </span>
            {c.isTracked ? <span className="sk-status sk-status-blue">Отслеживаемый</span> : null}
            {c.aiScore != null ? <span className="sk-status sk-status-green">AI {c.aiScore}</span> : null}
            <button type="button" className="sk-btn sk-btn-outline" style={{ height: 32, fontSize: 12 }} onClick={onChangeStatus}>
              <Icon name="refresh" className="w-3.5 h-3.5" /> Изменить статус
            </button>
          </div>

          <div className="meta-grid">
            {visibleFields.source ? (
              <div className="meta-row">
                <span className="meta-label">Источник</span>
                <span>{ruLabel(JOB_BOARD_LABELS, c.source, 'Добавлен вручную')}</span>
              </div>
            ) : null}
            {visibleFields.time ? (
              <div className="meta-row">
                <span className="meta-label">Время кандидата</span>
                <span>
                  {c.createdAt
                    ? new Date(c.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                    : '—'}{' '}
                  (UTC+3)
                </span>
              </div>
            ) : null}
            {visibleFields.gender ? (
              <div className="meta-row">
                <span className="meta-label">Пол</span>
                <span>{c.gender === 'FEMALE' ? 'Женский' : c.gender === 'MALE' ? 'Мужской' : '—'}</span>
              </div>
            ) : null}
          </div>

          {visibleFields.checks && c.checks?.length ? (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--sk-muted)' }}>
              Проверки: {c.checks.map((ch: any) => `${ruLabel(CHECK_TYPE_LABELS, ch.type)} — ${ruLabel(CHECK_STATUS_LABELS, ch.status)}`).join('; ')}
            </div>
          ) : null}
        </div>
      </div>

      <div className="candidate-card-side">
        <div>
          <div style={{ color: 'var(--sk-muted)', marginBottom: 2 }}>Вакансия</div>
          {c.vacancy ? (
            <Link href={`/vacancies/${c.vacancy.id}`} className="sk-link" style={{ fontWeight: 500, lineHeight: 1.35 }}>
              {c.vacancy.title}
            </Link>
          ) : (
            <span style={{ color: 'var(--sk-muted)' }}>—</span>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ color: 'var(--sk-muted)', marginBottom: 2 }}>Заявка</div>
          <span>{c.hiringRequest?.title || '—'}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ color: 'var(--sk-muted)', marginBottom: 2 }}>Обработчик</div>
          <span>{handlerName || '—'}</span>
        </div>
      </div>
    </Card>
  );
}
