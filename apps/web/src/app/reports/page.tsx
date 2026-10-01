'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell, Card, StatTile } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import { JOB_BOARD_LABELS, HIRING_REQUEST_STATUS_LABELS, ruLabel } from '@skillaz/shared';

function BarList({
  rows,
  labelKey,
  valueKey,
  formatLabel,
}: {
  rows: any[];
  labelKey: string;
  valueKey: string;
  formatLabel?: (v: any, row: any) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => {
        const value = Number(r[valueKey]) || 0;
        const label = formatLabel ? formatLabel(r[labelKey], r) : String(r[labelKey] ?? '—');
        return (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1 gap-2">
              <span className="truncate">{label}</span>
              <strong className="tabular-nums shrink-0">{value}</strong>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--sk-line)' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round((value / max) * 100)}%`,
                  borderRadius: 4,
                  background: 'linear-gradient(90deg, #14b8a6, #0f2744)',
                  minWidth: value ? 4 : 0,
                }}
              />
            </div>
          </div>
        );
      })}
      {!rows.length ? <div className="text-sm text-[var(--muted)]">Нет данных</div> : null}
    </div>
  );
}

export default function ReportsPage() {
  const summary = useQuery({ queryKey: ['rep-summary'], queryFn: () => api<any>('/reports/summary') });
  const processing = useQuery({ queryKey: ['rep-proc'], queryFn: () => api<any>('/reports/processing-time') });
  const requests = useQuery({ queryKey: ['rep-requests'], queryFn: () => api<any>('/reports/requests') });
  const metabase = useQuery({ queryKey: ['rep-metabase'], queryFn: () => api<any>('/reports/metabase') });

  const k = summary.data?.kpis || {};
  const funnel = summary.data?.funnel || [];
  const sources = summary.data?.sources || [];
  const workload = summary.data?.workload || [];
  const closeTime = summary.data?.closeTime || [];

  return (
    <AppShell title="Отчёты" subtitle="Сводка подбора: воронка, каналы, сроки, нагрузка">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatTile label="Кандидаты" value={summary.isLoading ? '—' : k.candidates ?? 0} href="/candidates" />
        <StatTile label="Открытые заявки" value={summary.isLoading ? '—' : k.openRequests ?? 0} href="/requests" />
        <StatTile label="Закрытые заявки" value={summary.isLoading ? '—' : k.closedRequests ?? 0} />
        <StatTile label="Активные вакансии" value={summary.isLoading ? '—' : k.activeVacancies ?? 0} href="/vacancies" />
        <StatTile label="Ср. срок закрытия" value={summary.isLoading ? '—' : k.avgCloseDays != null ? `${k.avgCloseDays} дн.` : '—'} />
        <StatTile label="Офферы" value={summary.isLoading ? '—' : k.offers ?? 0} href="/offers" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-1">Воронка кандидатов</div>
          <div className="text-xs text-[var(--muted)] mb-3">Сколько человек на каждом этапе</div>
          <BarList rows={funnel} labelKey="stageName" valueKey="count" />
        </Card>

        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-1">Источники</div>
          <div className="text-xs text-[var(--muted)] mb-3">Откуда приходят кандидаты</div>
          <BarList
            rows={sources}
            labelKey="source"
            valueKey="count"
            formatLabel={(v) => ruLabel(JOB_BOARD_LABELS, v, 'Не указан')}
          />
        </Card>

        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-1">Нагрузка рекрутеров</div>
          <div className="text-xs text-[var(--muted)] mb-3">Заявки и задачи в работе</div>
          <div className="space-y-2">
            {workload.map((r: any) => (
              <div key={r.id} className="flex justify-between text-sm gap-3 border-b border-[var(--line)] pb-2">
                <span>{r.lastName} {r.firstName}</span>
                <span className="text-[var(--muted)] text-xs shrink-0">
                  заявок {r._count?.hiringRequestsRecruited ?? 0} · задач {r._count?.assignedTasks ?? 0}
                </span>
              </div>
            ))}
            {!workload.length ? <div className="text-sm text-[var(--muted)]">Нет активных рекрутеров</div> : null}
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-1">Срок закрытия заявок</div>
          <div className="text-xs text-[var(--muted)] mb-3">
            {k.avgCloseDays != null ? `Среднее: ${k.avgCloseDays} дн.` : 'Пока нет закрытых заявок — средний срок появится после первых закрытий'}
          </div>
          <div className="space-y-2 max-h-56 overflow-auto">
            {closeTime.map((r: any) => (
              <div key={r.id} className="flex justify-between text-sm gap-3">
                <span className="truncate">{r.title}</span>
                <strong className="tabular-nums shrink-0">{r.daysOpen} дн.</strong>
              </div>
            ))}
            {!closeTime.length ? <div className="text-sm text-[var(--muted)]">Закрытых заявок пока нет</div> : null}
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-1">Последние смены этапов</div>
          <div className="text-xs text-[var(--muted)] mb-3">История обработки кандидатов</div>
          <div className="space-y-2 max-h-56 overflow-auto text-sm">
            {(processing.data?.rows || []).slice(-30).reverse().map((r: any) => (
              <div key={r.id} className="flex justify-between gap-2 border-b border-[var(--line)] pb-1">
                <span>
                  {r.candidate ? (
                    <Link href={`/candidates/${r.candidate.id}`} className="sk-link">{fullName(r.candidate)}</Link>
                  ) : '—'}
                  {' → '}{r.stage?.name || '—'}
                </span>
                <span className="text-[var(--muted)] text-xs shrink-0">{new Date(r.createdAt).toLocaleDateString('ru-RU')}</span>
              </div>
            ))}
            {!processing.data?.rows?.length ? <div className="text-[var(--muted)]">Истории статусов пока нет</div> : null}
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-bold text-[var(--brand-primary)] mb-1">Реестр заявок</div>
          <div className="text-xs text-[var(--muted)] mb-3">Всего в выборке: {requests.data?.rows?.length ?? 0}</div>
          <div className="space-y-2 max-h-56 overflow-auto text-sm">
            {(requests.data?.rows || []).slice(0, 20).map((r: any) => (
              <div key={r.id} className="flex justify-between gap-2 border-b border-[var(--line)] pb-1">
                <Link href={`/requests/${r.id}`} className="sk-link truncate">{r.title}</Link>
                <span className="text-xs text-[var(--muted)] shrink-0">{ruLabel(HIRING_REQUEST_STATUS_LABELS, r.status)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--line)]">
            <div className="font-medium text-sm mb-1">Расширенная аналитика</div>
            <p className="text-xs text-[var(--muted)] mb-2">{metabase.data?.note}</p>
            {metabase.data?.enabled ? (
              <Link className="text-[var(--brand-secondary)] underline text-sm" href="/reports/metabase">
                Открыть аналитику
              </Link>
            ) : (
              <div className="text-xs text-[var(--muted)]">
                Сейчас достаточно блоков выше. Расширенная аналитика появится после подключения администратором.
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
