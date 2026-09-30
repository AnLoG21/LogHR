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
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/vacancies/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacancy', id] }),
  });

  if (!v) return <AppShell title="Вакансия"><div className="text-[var(--muted)]">Загрузка…</div></AppShell>;

  const counters = new Map<string, number>(
    (v.stageCounters || []).map((s: any) => [String(s.stageId), Number(s._count) || 0]),
  );
  const applyUrl = typeof window !== 'undefined' ? `${window.location.origin}/public/apply/${id}` : `/public/apply/${id}`;

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
      <Card className="p-4 mb-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="text-sm">
          <div className="font-semibold">Публичный отклик</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {v.isPublicApply ? (
              <>Ссылка: <a className="underline text-[var(--brand-secondary)]" href={applyUrl} target="_blank" rel="noreferrer">{applyUrl}</a></>
            ) : (
              'Выключен — включите, чтобы принимать отклики без логина'
            )}
          </div>
        </div>
        <Button
          variant={v.isPublicApply ? 'ghost' : undefined}
          onClick={() => patch.mutate({ isPublicApply: !v.isPublicApply })}
          disabled={patch.isPending}
        >
          {v.isPublicApply ? 'Выключить форму' : 'Включить форму отклика'}
        </Button>
      </Card>
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
