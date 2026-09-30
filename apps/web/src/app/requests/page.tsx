'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { HIRING_REQUEST_STATUS_LABELS, HiringRequestStatus, PRIORITY_LABELS, ruLabel } from '@skillaz/shared';
import { AppShell, Button, Card, Empty, Icon, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';

export default function RequestsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['requests'],
    queryFn: () => api<any>('/hiring-requests?pageSize=50'),
  });
  const orgUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=100') });
  const profiles = useQuery({ queryKey: ['profiles-mini'], queryFn: () => api<any>('/profiles?pageSize=100') });

  const change = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/hiring-requests/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });

  const create = useMutation({
    mutationFn: (body: any) => api('/hiring-requests', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  const items = data?.items || [];

  return (
    <AppShell
      title="Заявки"
      actions={
        <Button onClick={() => setOpen(true)}>
          <Icon name="plus" className="w-4 h-4" /> Добавить заявку
        </Button>
      }
    >
      <Card className="p-4 mb-4">
        <div className="text-[13px] font-semibold text-[var(--sk-label)] mb-3">Фильтры заявок</div>
        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Select defaultValue=""><option value="">Статус</option></Select>
          <Select defaultValue=""><option value="">Профиль кандидата</option></Select>
          <Select defaultValue=""><option value="">Воронка</option></Select>
          <Select defaultValue=""><option value="">Вакансия</option></Select>
          <Select defaultValue=""><option value="">Орг единица</option></Select>
          <Select defaultValue=""><option value="">Приоритет заявки</option></Select>
        </div>
      </Card>

      <div className="text-[13px] font-semibold mb-3">Всего {items.length} заявки</div>

      {isLoading ? <Empty text="Загрузка…" /> : null}

      <div className="space-y-3">
        {items.map((r: any) => (
          <Card key={r.id} className="p-5">
            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <Link href={`/requests/${r.id}`} className="text-[17px] font-bold leading-snug hover:text-[var(--sk-link)]">
                  {r.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[13px]">
                  <span className={r.status === 'IN_PROGRESS' || r.status === 'APPROVED_HR_BP' ? 'text-[var(--sk-green)] font-semibold' : 'text-[var(--sk-muted)] font-semibold'}>
                    {HIRING_REQUEST_STATUS_LABELS[r.status as HiringRequestStatus] || r.status}
                  </span>
                  <span className="text-[var(--sk-muted)]">·</span>
                  <span className="text-[var(--sk-muted)]">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-[13px]">
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-44 shrink-0">Профиль кандидата</span><span>{r.candidateProfile?.name || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-44 shrink-0">Количество позиций</span><span>{r.positionsCount}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-44 shrink-0">Орг единица</span><span className="truncate">{r.orgUnit?.name || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-44 shrink-0">Адрес / Рабочее место</span><span>{r.workAddress || r.city || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-44 shrink-0">Приоритет заявки</span><span>{ruLabel(PRIORITY_LABELS, r.priority)}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-44 shrink-0">Плановая дата закрытия</span><span>{r.plannedCloseDate ? new Date(r.plannedCloseDate).toLocaleDateString('ru-RU') : 'Не указано'}</span></div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <Link href={`/candidates?requestId=${r.id}`} className="sk-link text-[13px] font-medium">Показать кандидатов</Link>
                  {r.status === 'NEW' && (
                    <Button variant="ghost" className="h-8 text-[12px]" onClick={() => change.mutate({ id: r.id, status: 'PENDING_HR_BP' })}>На согласование</Button>
                  )}
                  {r.status === 'PENDING_HR_BP' && (
                    <>
                      <Button className="h-8 text-[12px]" onClick={() => change.mutate({ id: r.id, status: 'APPROVED_HR_BP' })}>Согласовать</Button>
                      <Button variant="ghost" className="h-8 text-[12px]" onClick={() => change.mutate({ id: r.id, status: 'REJECTED_HR_BP' })}>Отклонить</Button>
                    </>
                  )}
                  {r.status === 'APPROVED_HR_BP' && (
                    <Button className="h-8 text-[12px]" onClick={() => change.mutate({ id: r.id, status: 'IN_PROGRESS' })}>В работу</Button>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--sk-line)]">
                  <div className="text-[13px] font-semibold mb-2">Кандидаты</div>
                  <div className="flex items-center justify-between rounded-md border border-[var(--sk-line)] px-3 py-2 text-[13px] bg-[#fafbfc]">
                    <span className="text-[var(--sk-muted)]">Уже оформлено</span>
                    <span className="w-6 h-6 rounded-full bg-[var(--sk-ink)] text-white text-[11px] font-bold grid place-items-center">0</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Link href={`/requests/${r.id}`} className="sk-btn sk-btn-icon"><Icon name="edit" /></Link>
                <button className="sk-btn sk-btn-icon"><Icon name="more" /></button>
              </div>
            </div>
          </Card>
        ))}
        {!isLoading && !items.length ? <Empty text="Список пуст" /> : null}
      </div>

      <Modal open={open} title="Новая заявка" onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            create.mutate({
              title: fd.get('title'),
              orgUnitId: fd.get('orgUnitId'),
              candidateProfileId: fd.get('candidateProfileId') || undefined,
              positionsCount: Number(fd.get('positionsCount') || 1),
              priority: fd.get('priority') || 'MEDIUM',
              city: fd.get('city') || undefined,
            });
          }}
        >
          <Input name="title" placeholder="Название заявки" required />
          <Select name="orgUnitId" required defaultValue="">
            <option value="" disabled>Орг. единица</option>
            {(orgUnits.data?.items || []).map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
          <Select name="candidateProfileId" defaultValue="">
            <option value="">Профиль кандидата</option>
            {(profiles.data?.items || []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Input name="positionsCount" type="number" min={1} defaultValue={1} />
          <Select name="priority" defaultValue="MEDIUM">
            <option value="LOW">Низкий</option>
            <option value="MEDIUM">Средний</option>
            <option value="HIGH">Высокий</option>
          </Select>
          <Input name="city" placeholder="Город" />
          <Button type="submit" disabled={create.isPending}>Создать</Button>
        </form>
      </Modal>
    </AppShell>
  );
}
