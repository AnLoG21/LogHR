'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell, Badge, Button, Card, StageStrip } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function VacancyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: v } = useQuery({
    queryKey: ['vacancy', id],
    queryFn: () => api<any>(`/vacancies/${id}`),
  });

  const publish = useMutation({
    mutationFn: (board: string) =>
      api('/publications', { method: 'POST', body: JSON.stringify({ vacancyId: id, board }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacancy', id] }),
  });

  if (!v) return <AppShell title="Вакансия"><div className="text-[var(--muted)]">Загрузка…</div></AppShell>;

  const counters = new Map<string, number>(
    (v.stageCounters || []).map((s: any) => [String(s.stageId), Number(s._count) || 0]),
  );

  return (
    <AppShell
      title={v.title}
      subtitle={v.description || ''}
      actions={
        <>
          <Button variant="ghost" onClick={() => publish.mutate('HH')}>HH</Button>
          <Button variant="ghost" onClick={() => publish.mutate('AVITO')}>Avito</Button>
        </>
      }
    >
      <div className="mb-4">
        <StageStrip stages={v.funnel?.stages || []} counts={counters} />
      </div>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] font-semibold text-[var(--brand-primary)]">Кандидаты</div>
        <div className="divide-y divide-[var(--line)]">
          {(v.candidates || []).map((c: any) => (
            <Link key={c.id} href={`/candidates/${c.id}`} className="flex justify-between px-4 py-3 hover:bg-[#f7fbfc] text-sm">
              <span className="font-medium">{fullName(c)}</span>
              <Badge color="blue">{c.stage?.name || '—'}</Badge>
            </Link>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
