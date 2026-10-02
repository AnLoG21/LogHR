'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { HIRING_REQUEST_STATUS_LABELS, HiringRequestStatus, PRIORITY_LABELS, ruLabel } from '@skillaz/shared';
import { AppShell, Badge, Button, Card, Empty, Icon, Input, Select } from '@/components/ui';
import { RequestFormModal, RequestStatusActions, requestToForm, type RequestFormValue } from '@/components/request-form';
import { api } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  NEW: 'slate',
  PENDING_HR_BP: 'amber',
  APPROVED_HR_BP: 'blue',
  REJECTED_HR_BP: 'rose',
  IN_PROGRESS: 'green',
  PAUSED: 'amber',
  CANCELLED: 'slate',
  CLOSED: 'slate',
};

export default function RequestsPage() {
  const [form, setForm] = useState<RequestFormValue | null>(null);
  const [filters, setFilters] = useState({ search: '', status: '', candidateProfileId: '', orgUnitId: '', priority: '' });

  const qs = useMemo(() => {
    const p = new URLSearchParams({ pageSize: '100' });
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [filters]);

  const { data, isLoading } = useQuery({
    queryKey: ['requests', qs],
    queryFn: () => api<any>(`/hiring-requests?${qs}`),
  });
  const orgUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=200') });
  const profiles = useQuery({ queryKey: ['profiles-mini'], queryFn: () => api<any>('/profiles?pageSize=200') });

  const items = data?.items || [];
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <AppShell
      title="Заявки"
      subtitle="Заявки на подбор от подразделений: согласование, работа и закрытие"
      actions={
        <Button onClick={() => setForm(requestToForm())}>
          <Icon name="plus" className="w-4 h-4" /> Новая заявка
        </Button>
      }
    >
      <Card className="p-4 mb-4">
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-2">
          <Input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Поиск по названию" aria-label="Поиск по названию" />
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Статус">
            <option value="">Все статусы</option>
            {Object.entries(HIRING_REQUEST_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={filters.candidateProfileId} onChange={(e) => setFilters({ ...filters, candidateProfileId: e.target.value })} aria-label="Профиль кандидата">
            <option value="">Все профили</option>
            {(profiles.data?.items || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={filters.orgUnitId} onChange={(e) => setFilters({ ...filters, orgUnitId: e.target.value })} aria-label="Подразделение">
            <option value="">Все подразделения</option>
            {(orgUnits.data?.items || []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} aria-label="Приоритет">
            <option value="">Любой приоритет</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {hasFilters ? (
          <button type="button" className="sk-link text-[13px] mt-3" onClick={() => setFilters({ search: '', status: '', candidateProfileId: '', orgUnitId: '', priority: '' })}>
            Сбросить фильтры
          </button>
        ) : null}
      </Card>

      <div className="text-[13px] text-[var(--sk-muted)] mb-3">Найдено: {data?.total ?? items.length}</div>
      {isLoading ? <Empty text="Загрузка…" /> : null}

      <div className="space-y-3">
        {items.map((r: any) => (
          <Card key={r.id} className="p-5">
            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/requests/${r.id}`} className="text-[17px] font-bold leading-snug hover:text-[var(--sk-link)]">
                    {r.title}
                  </Link>
                  <Badge color={STATUS_COLOR[r.status] || 'slate'}>{HIRING_REQUEST_STATUS_LABELS[r.status as HiringRequestStatus] || r.status}</Badge>
                  {r.priority === 'HIGH' ? <Badge color="rose">Высокий приоритет</Badge> : null}
                </div>
                <div className="text-[13px] text-[var(--sk-muted)] mt-1">
                  Обновлена {r.updatedAt ? new Date(r.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>

                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-[13px]">
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Профиль кандидата</span><span>{r.candidateProfile?.name || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Подразделение</span><span className="truncate">{r.orgUnit?.name || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Город</span><span>{r.city || r.orgUnit?.city || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Рекрутер</span><span>{r.recruiter ? `${r.recruiter.lastName} ${r.recruiter.firstName}` : 'Не назначен'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Приоритет</span><span>{ruLabel(PRIORITY_LABELS, r.priority)}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Вакансия</span>{r.vacancy ? <Link href={`/vacancies/${r.vacancy.id}`} className="sk-link">{r.vacancy.title}</Link> : <span>Появится после взятия в работу</span>}</div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-[var(--sk-soft)] px-3 py-2 text-[13px]">
                  <span>Нужно: <strong>{r.positionsCount}</strong></span>
                  <span>Оформлено: <strong>{r.hiredCount ?? 0}</strong></span>
                  <span>Кандидатов: <strong>{r._count?.candidates ?? 0}</strong></span>
                  <Link href={`/candidates?requestId=${r.id}`} className="sk-link ml-auto">Показать кандидатов</Link>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <RequestStatusActions request={r} />
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {r.status !== 'CLOSED' && r.status !== 'CANCELLED' ? (
                  <button type="button" className="sk-btn sk-btn-icon" title="Изменить заявку" aria-label="Изменить заявку" onClick={() => setForm(requestToForm(r))}>
                    <Icon name="edit" />
                  </button>
                ) : null}
                <Link href={`/requests/${r.id}`} className="sk-btn sk-btn-icon" title="Открыть" aria-label="Открыть заявку"><Icon name="eye" /></Link>
              </div>
            </div>
          </Card>
        ))}
        {!isLoading && !items.length ? <Empty text={hasFilters ? 'По фильтрам ничего не найдено' : 'Заявок пока нет'} /> : null}
      </div>

      <RequestFormModal value={form} onClose={() => setForm(null)} />
    </AppShell>
  );
}
