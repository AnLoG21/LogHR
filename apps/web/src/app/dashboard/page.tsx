'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell, Badge, Card, StageStrip, StatTile } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<any>('/dashboard'),
  });
  const funnels = useQuery({
    queryKey: ['funnels'],
    queryFn: () => api<any[]>('/funnels'),
  });

  const counters = data?.counters || {};
  const funnel = funnels.data?.[0];
  const counts = new Map<string, number>();
  for (const row of data?.funnelBreakdown || []) {
    if (row.stageId) counts.set(row.stageId, row._count);
  }

  return (
    <AppShell
      title="Рабочий стол"
      subtitle="Подбор в одном окне — от заявки до оформления"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <StatTile label="Кандидаты" value={isLoading ? '—' : counters.candidates ?? 0} href="/candidates" />
        <StatTile label="Открытые заявки" value={isLoading ? '—' : counters.openRequests ?? 0} href="/requests" />
        <StatTile label="Ждут согласования" value={isLoading ? '—' : counters.pendingApprovals ?? 0} href="/checks" />
        <StatTile
          label="Ср. срок закрытия"
          value={isLoading ? '—' : counters.avgCloseDays != null ? `${counters.avgCloseDays} дн.` : '—'}
          href="/reports"
        />
        <StatTile label="Вакансии" value={isLoading ? '—' : counters.vacancies ?? 0} href="/vacancies" />
        <StatTile label="Мои задачи" value={isLoading ? '—' : counters.myTasks ?? 0} href="/tasks" />
        <StatTile label="Офферы" value={isLoading ? '—' : counters.offers ?? 0} href="/offers" />
        <StatTile label="Проверки в работе" value={isLoading ? '—' : counters.checks ?? 0} href="/checks" />
      </div>

      {funnel ? (
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-bold text-[var(--brand-primary)]">{funnel.name}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Распределение кандидатов по этапам</div>
            </div>
            <Link href="/reports" className="sk-link text-sm">К отчётам</Link>
          </div>
          <StageStrip stages={funnel.stages || []} counts={counts} />
        </Card>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] font-semibold text-[var(--brand-primary)] flex justify-between gap-2">
            <span>Ждут решения заказчика</span>
            <Link href="/checks" className="sk-link text-xs font-normal">Все проверки</Link>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {(data?.awaitingApproval || []).map((ch: any) => (
              <div key={ch.id} className="px-4 py-3 flex justify-between gap-3 items-center text-sm">
                <div className="min-w-0">
                  {ch.candidate ? (
                    <Link href={`/candidates/${ch.candidate.id}`} className="font-semibold sk-link">
                      {fullName(ch.candidate)}
                    </Link>
                  ) : (
                    <span>Кандидат</span>
                  )}
                  <div className="text-xs text-[var(--muted)] mt-0.5 truncate">
                    {ch.candidate?.vacancy?.title || 'Без вакансии'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge color="amber">ожидает</Badge>
                  {ch.externalToken ? (
                    <a className="sk-link text-xs" href={`/public/check/${ch.externalToken}`} target="_blank" rel="noreferrer">
                      ссылка
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
            {!isLoading && !(data?.awaitingApproval || []).length ? (
              <div className="px-4 py-8 text-center text-[var(--muted)] text-sm">
                Нет ожидающих согласований — отправьте кандидата кнопкой «На согласование»
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] font-semibold text-[var(--brand-primary)]">
            Недавние кандидаты
          </div>
          <div className="divide-y divide-[var(--line)]">
            {(data?.recentCandidates || []).map((c: any, i: number) => (
              <Link
                key={c.id}
                href={`/candidates/${c.id}`}
                className="flex items-center justify-between px-4 py-3.5 hover:bg-[#f4fafb] table-row-enter"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <div className="font-semibold">{fullName(c)}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">{c.vacancy?.title || 'Без вакансии'}</div>
                </div>
                {c.stage ? <Badge color="blue">{c.stage.name}</Badge> : null}
              </Link>
            ))}
            {!isLoading && !data?.recentCandidates?.length ? (
              <div className="px-4 py-10 text-center text-[var(--muted)] text-sm">Пока нет кандидатов</div>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
