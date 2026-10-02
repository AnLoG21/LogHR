'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OFFER_STATUS_LABELS, OfferStatus, ruLabel } from '@skillaz/shared';
import { AppShell, Badge, Button, Card, ConfirmDelete, Empty } from '@/components/ui';
import { api, fullName } from '@/lib/api';

const OFFER_NEXT: Record<string, { status: string; label: string }[]> = {
  DRAFT: [
    { status: 'PENDING_MANAGER', label: 'На согласование' },
    { status: 'SENT_TO_CANDIDATE', label: 'Отправить кандидату' },
  ],
  PENDING_MANAGER: [
    { status: 'APPROVED_MANAGER', label: 'Согласовать' },
    { status: 'REJECTED_MANAGER', label: 'Отклонить' },
  ],
  APPROVED_MANAGER: [{ status: 'SENT_TO_CANDIDATE', label: 'Отправить' }],
  REJECTED_MANAGER: [{ status: 'DRAFT', label: 'На доработку' }],
  SENT_TO_CANDIDATE: [
    { status: 'ACCEPTED', label: 'Принят' },
    { status: 'DECLINED', label: 'Отказ' },
  ],
};

async function downloadOfferPdf(id: string) {
  const res = await api<{ base64: string }>(`/offers/${id}/pdf`);
  const bin = atob(res.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'offer.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
  const remove = useMutation({
    mutationFn: (id: string) => api(`/offers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const pdf = useMutation({ mutationFn: downloadOfferPdf });

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
                <td className="px-4 py-3 font-medium">
                  {o.candidate?.id ? (
                    <Link className="sk-link" href={`/candidates/${o.candidate.id}?tab=offers`}>
                      {fullName(o.candidate)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">{o.position || '—'}</td>
                <td className="px-4 py-3">{o.salary ? `${o.salary} ${o.currency}` : '—'}</td>
                <td className="px-4 py-3">
                  <Badge color="blue">{ruLabel(OFFER_STATUS_LABELS, o.status as OfferStatus) || o.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(OFFER_NEXT[o.status] || []).map((n) => (
                      <Button key={n.status} variant="ghost" disabled={change.isPending} onClick={() => change.mutate({ id: o.id, status: n.status })}>
                        {n.label}
                      </Button>
                    ))}
                    {o.externalToken ? (
                      <a className="text-xs text-[var(--brand-secondary)] underline self-center" href={`/public/offer/${o.externalToken}`} target="_blank" rel="noreferrer">
                        Ссылка
                      </a>
                    ) : null}
                    <Button variant="ghost" disabled={pdf.isPending} onClick={() => pdf.mutate(o.id)}>PDF</Button>
                    {o.status !== 'ACCEPTED' ? (
                      <ConfirmDelete question="Удалить оффер?" onConfirm={() => remove.mutate(o.id)} pending={remove.isPending} />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !data?.items?.length ? <Empty text="Офферов пока нет — создайте в карточке кандидата" /> : null}
      </Card>
    </AppShell>
  );
}
