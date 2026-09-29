'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { HIRING_REQUEST_STATUS_LABELS, HiringRequestStatus } from '@skillaz/shared';
import { AppShell, Badge, Card } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r } = useQuery({
    queryKey: ['request', id],
    queryFn: () => api<any>(`/hiring-requests/${id}`),
  });

  if (!r) {
    return <AppShell title="Заявка"><div className="text-[var(--muted)]">Загрузка…</div></AppShell>;
  }

  return (
    <AppShell
      title={r.title}
      subtitle={`${r.orgUnit?.name} · ${r.candidateProfile?.name}`}
      actions={
        <Badge color="blue">
          {HIRING_REQUEST_STATUS_LABELS[r.status as HiringRequestStatus] || r.status}
        </Badge>
      }
    >
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2 text-sm">
          <div>Город: {r.city || '—'}</div>
          <div>Позиций: {r.positionsCount}</div>
          <div>Вакансия: {r.vacancy?.title || 'ещё не создана'}</div>
          <div>Рекрутер: {r.recruiter ? `${r.recruiter.lastName} ${r.recruiter.firstName}` : '—'}</div>
          <div>Менеджер: {r.hiringManager ? `${r.hiringManager.lastName} ${r.hiringManager.firstName}` : '—'}</div>
          <div className="pt-2 text-[var(--muted)]">{r.comment}</div>
        </Card>
        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-2">История статусов</div>
          <div className="space-y-2 text-sm">
            {(r.statusHistory || []).map((h: any) => (
              <div key={h.id}>
                {h.fromStatus ? `${h.fromStatus} → ` : ''}
                <strong>{h.toStatus}</strong>
                <span className="text-[var(--muted)] text-xs ml-2">{new Date(h.createdAt).toLocaleString('ru-RU')}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <div className="font-bold text-[var(--brand-primary)] mb-2">Кандидаты</div>
          <div className="divide-y divide-[var(--line)]">
            {(r.candidates || []).map((c: any) => (
              <div key={c.id} className="py-2 flex justify-between text-sm">
                <span>{fullName(c)}</span>
                <Badge color="blue">{c.stage?.name || '—'}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
