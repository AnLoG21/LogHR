'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { HIRING_REQUEST_STATUS_LABELS, HiringRequestStatus, PRIORITY_LABELS, ruLabel } from '@skillaz/shared';
import { AppShell, Badge, Button, Card, Icon } from '@/components/ui';
import { RequestFormModal, RequestStatusActions, requestToForm, type RequestFormValue } from '@/components/request-form';
import { api, fullName } from '@/lib/api';

const statusLabel = (s?: string) => (s ? HIRING_REQUEST_STATUS_LABELS[s as HiringRequestStatus] || s : '');

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<RequestFormValue | null>(null);
  const { data: r } = useQuery({
    queryKey: ['request', id],
    queryFn: () => api<any>(`/hiring-requests/${id}`),
  });

  if (!r) {
    return <AppShell title="Заявка"><div className="text-[var(--sk-muted)]">Загрузка…</div></AppShell>;
  }

  const editable = r.status !== 'CLOSED' && r.status !== 'CANCELLED';
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-3 py-1.5">
      <span className="w-44 shrink-0 text-[var(--sk-muted)]">{label}</span>
      <span className="min-w-0">{value}</span>
    </div>
  );

  return (
    <AppShell
      title={r.title}
      subtitle={[r.orgUnit?.name, r.candidateProfile?.name].filter(Boolean).join(' · ')}
      actions={
        <>
          <Link href="/requests" className="sk-btn sk-btn-outline">← Все заявки</Link>
          {editable ? <Button variant="ghost" onClick={() => setForm(requestToForm(r))}><Icon name="edit" className="w-4 h-4" /> Изменить</Button> : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge color="blue">{statusLabel(r.status)}</Badge>
        <RequestStatusActions request={r} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4 text-sm">
          <div className="font-bold mb-2">Параметры</div>
          {row('Сколько нужно', r.positionsCount)}
          {row('Приоритет', ruLabel(PRIORITY_LABELS, r.priority))}
          {row('Город', r.city || r.orgUnit?.city || '—')}
          {row('Вакансия', r.vacancy ? <Link href={`/vacancies/${r.vacancy.id}`} className="sk-link">{r.vacancy.title}</Link> : 'Появится после взятия в работу')}
          {row('Рекрутер', r.recruiter ? `${r.recruiter.lastName} ${r.recruiter.firstName}` : 'Не назначен')}
          {row('Нанимающий менеджер', r.hiringManager ? `${r.hiringManager.lastName} ${r.hiringManager.firstName}` : 'Не назначен')}
          {r.comment ? <div className="mt-2 pt-2 border-t border-[var(--sk-line)] whitespace-pre-wrap">{r.comment}</div> : null}
        </Card>
        <Card className="p-4">
          <div className="font-bold mb-2">История</div>
          <div className="space-y-2 text-sm">
            {(r.statusHistory || []).map((h: any) => (
              <div key={h.id} className="flex flex-wrap gap-x-2">
                <span>
                  {h.fromStatus ? `${statusLabel(h.fromStatus)} → ` : ''}
                  <strong>{statusLabel(h.toStatus)}</strong>
                </span>
                <span className="text-[var(--sk-muted)] text-xs self-center">{new Date(h.createdAt).toLocaleString('ru-RU')}</span>
                {h.comment ? <span className="w-full text-[13px] text-[var(--sk-muted)]">{h.comment}</span> : null}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold">Кандидаты ({(r.candidates || []).length})</div>
            <Link href={`/candidates?requestId=${r.id}`} className="sk-link text-sm">Открыть в списке</Link>
          </div>
          <div className="divide-y divide-[var(--sk-line)]">
            {(r.candidates || []).map((c: any) => (
              <Link key={c.id} href={`/candidates/${c.id}`} className="py-2 flex justify-between text-sm hover:bg-[var(--sk-hover)] px-2 -mx-2 rounded">
                <span>{fullName(c)}</span>
                <Badge color={c.stage?.isFinal ? 'green' : 'blue'}>{c.stage?.name || '—'}</Badge>
              </Link>
            ))}
            {!(r.candidates || []).length ? <div className="py-3 text-sm text-[var(--sk-muted)]">Кандидатов по заявке пока нет</div> : null}
          </div>
        </Card>
      </div>

      <RequestFormModal value={form} onClose={() => setForm(null)} />
    </AppShell>
  );
}
