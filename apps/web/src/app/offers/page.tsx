'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OFFER_STATUS_LABELS, OfferStatus } from '@skillaz/shared';
import { AppShell, Badge, Button, Card, Empty } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function OffersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: () => api<any>('/offers?pageSize=50'),
  });
  const change = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/offers/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });

  return (
    <AppShell title="Офферы" subtitle="Согласование и направление кандидату">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--sk-soft)] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Кандидат</th>
              <th className="px-4 py-3 font-semibold">Должность</th>
              <th className="px-4 py-3 font-semibold">Оклад</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3 font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {(data?.items || []).map((o: any) => (
              <tr key={o.id} className="hover:bg-[var(--sk-hover)]">
                <td className="px-4 py-3 font-medium">{o.candidate ? fullName(o.candidate) : '—'}</td>
                <td className="px-4 py-3">{o.position || '—'}</td>
                <td className="px-4 py-3">{o.salary ? `${o.salary} ${o.currency}` : '—'}</td>
                <td className="px-4 py-3">
                  <Badge color="blue">{OFFER_STATUS_LABELS[o.status as OfferStatus] || o.status}</Badge>
                </td>
                <td className="px-4 py-3 space-x-1">
                  {o.status === 'DRAFT' && (
                    <Button variant="ghost" onClick={() => change.mutate({ id: o.id, status: 'PENDING_MANAGER' })}>На согласование</Button>
                  )}
                  {o.status === 'PENDING_MANAGER' && (
                    <Button variant="ghost" onClick={() => change.mutate({ id: o.id, status: 'APPROVED_MANAGER' })}>Согласовать</Button>
                  )}
                  {o.status === 'APPROVED_MANAGER' && (
                    <Button onClick={() => change.mutate({ id: o.id, status: 'SENT_TO_CANDIDATE' })}>Отправить</Button>
                  )}
                  {o.externalToken ? (
                    <a className="text-xs text-[var(--brand-secondary)] underline ml-2" href={`/public/offer/${o.externalToken}`} target="_blank" rel="noreferrer">Ссылка для кандидата</a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !data?.items?.length ? <Empty text="Офферов пока нет" /> : null}
      </Card>
    </AppShell>
  );
}
