'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell, Card } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import { JOB_BOARD_LABELS, ruLabel } from '@skillaz/shared';

export default function ReportsPage() {
  const funnel = useQuery({ queryKey: ['rep-funnel'], queryFn: () => api<any>('/reports/funnel') });
  const sources = useQuery({ queryKey: ['rep-sources'], queryFn: () => api<any>('/reports/sources') });
  const workload = useQuery({ queryKey: ['rep-workload'], queryFn: () => api<any>('/reports/recruiter-workload') });
  const requests = useQuery({ queryKey: ['rep-requests'], queryFn: () => api<any>('/reports/requests') });
  const closeTime = useQuery({ queryKey: ['rep-close'], queryFn: () => api<any>('/reports/close-time') });
  const processing = useQuery({ queryKey: ['rep-proc'], queryFn: () => api<any>('/reports/processing-time') });
  const metabase = useQuery({ queryKey: ['rep-metabase'], queryFn: () => api<any>('/reports/metabase') });

  return (
    <AppShell title="Отчёты" subtitle="Встроенная аналитика и Metabase BI">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-3">{funnel.data?.name || 'Воронка'}</div>
          <div className="space-y-2">
            {(funnel.data?.rows || []).map((r: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{r.stageName}</span>
                <strong className="tabular-nums">{r.count}</strong>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-3">{sources.data?.name || 'Источники'}</div>
          <div className="space-y-2">
            {(sources.data?.sources || []).map((r: any) => (
              <div key={r.source} className="flex justify-between text-sm">
                <span>{ruLabel(JOB_BOARD_LABELS, r.source, 'Не указан')}</span>
                <strong className="tabular-nums">{r.count}</strong>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-3">{workload.data?.name || 'Занятость'}</div>
          <div className="space-y-2">
            {(workload.data?.rows || []).map((r: any) => (
              <div key={r.id} className="flex justify-between text-sm gap-3">
                <span>{r.lastName} {r.firstName}</span>
                <span className="text-[var(--muted)] text-xs">заявок {r._count.hiringRequestsRecruited} · задач {r._count.assignedTasks}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-3">{closeTime.data?.name || 'Срок закрытия заявки'}</div>
          <div className="space-y-2 max-h-56 overflow-auto">
            {(closeTime.data?.rows || []).map((r: any) => (
              <div key={r.id} className="flex justify-between text-sm gap-3">
                <span className="truncate">{r.title}</span>
                <strong className="tabular-nums shrink-0">{r.daysOpen} дн.</strong>
              </div>
            ))}
            {!closeTime.data?.rows?.length ? <div className="text-sm text-[var(--muted)]">Закрытых заявок пока нет</div> : null}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-3">{processing.data?.name || 'Сроки обработки'}</div>
          <div className="space-y-2 max-h-56 overflow-auto text-sm">
            {(processing.data?.rows || []).slice(0, 30).map((r: any) => (
              <div key={r.id} className="flex justify-between gap-2 border-b border-[var(--line)] pb-1">
                <span>{r.candidate ? fullName(r.candidate) : '—'} → {r.stage?.name || '—'}</span>
                <span className="text-[var(--muted)] text-xs shrink-0">{new Date(r.createdAt).toLocaleDateString('ru-RU')}</span>
              </div>
            ))}
            {!processing.data?.rows?.length ? <div className="text-[var(--muted)]">Истории статусов пока нет</div> : null}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-3">Metabase BI</div>
          <p className="text-sm text-[var(--muted)] mb-2">{metabase.data?.note}</p>
          <a className="text-[var(--brand-secondary)] underline text-sm" href={metabase.data?.url || 'http://localhost:3002'} target="_blank" rel="noreferrer">
            Открыть Metabase
          </a>
          <ul className="mt-3 text-sm list-disc pl-5 space-y-1">
            {(metabase.data?.reports || []).map((r: string) => <li key={r}>{r}</li>)}
          </ul>
          <div className="mt-3 text-xs text-[var(--muted)]">Реестр заявок: {requests.data?.rows?.length ?? 0}</div>
          <div className="mt-2 text-xs text-[var(--muted)]">SQL-шаблоны: docs/metabase-dashboards.sql</div>
        </Card>
      </div>
    </AppShell>
  );
}
