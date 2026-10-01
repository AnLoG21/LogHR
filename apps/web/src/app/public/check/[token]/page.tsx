'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, Textarea } from '@/components/ui';
import { CHECK_STATUS_LABELS, CHECK_TYPE_LABELS, ruLabel } from '@skillaz/shared';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function publicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function PublicCheckPage() {
  const { token } = useParams<{ token: string }>();
  const [notes, setNotes] = useState('');
  const { data, refetch } = useQuery({
    queryKey: ['public-check', token],
    queryFn: () => publicApi<any>(`/checks/public/${token}`),
  });
  const isFeedback = data?.type === 'FEEDBACK';
  const done = data && ['APPROVED', 'REJECTED', 'CANCELLED'].includes(data.status);

  const submit = useMutation({
    mutationFn: (decision?: 'APPROVED' | 'REJECTED') =>
      publicApi(`/checks/public/${token}`, {
        method: 'POST',
        body: JSON.stringify({
          notes,
          decision: decision || undefined,
          submittedAt: new Date().toISOString(),
        }),
      }),
    onSuccess: () => refetch(),
  });

  const c = data?.candidate;
  const brand = 'ТАЙМЫР ИНВЕСТ';

  return (
    <div className="min-h-screen" style={{ background: '#f5f7f9' }}>
      <div className="bg-[var(--brand-primary)] text-white px-6 py-10">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">{brand}</div>
        <h1 className="text-3xl font-extrabold mt-2">
          {isFeedback ? 'Согласование кандидата' : 'Форма проверки'}
        </h1>
        {c?.vacancy?.title ? (
          <p className="mt-2 opacity-90">{c.vacancy.title}{c.vacancy.city ? ` · ${c.vacancy.city}` : ''}</p>
        ) : null}
      </div>
      <div className="max-w-xl mx-auto px-4 py-8">
        <Card className="p-6 space-y-4">
          <div className="text-sm text-[var(--muted)]">
            {ruLabel(CHECK_TYPE_LABELS, data?.type)} · {ruLabel(CHECK_STATUS_LABELS, data?.status)}
          </div>
          <div>
            <div className="text-xl font-bold">{c ? `${c.lastName} ${c.firstName}` : '…'}</div>
            <div className="text-sm text-[var(--muted)] mt-1">
              {[c?.currentPosition || c?.desiredPosition, c?.city].filter(Boolean).join(' · ')}
            </div>
          </div>
          {c?.resumePreview ? (
            <div className="text-sm whitespace-pre-wrap" style={{ maxHeight: 220, overflow: 'auto', lineHeight: 1.5 }}>
              {c.resumePreview}
            </div>
          ) : null}

          {done ? (
            <div className="text-[var(--success)] font-semibold">
              Решение зафиксировано: {ruLabel(CHECK_STATUS_LABELS, data.status)}
              {data.comment ? <div className="text-sm text-[var(--muted)] font-normal mt-1">{data.comment}</div> : null}
            </div>
          ) : (
            <>
              <Textarea
                placeholder={isFeedback ? 'Комментарий для рекрутера (необязательно)' : 'Комментарий / данные анкеты'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {isFeedback ? (
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => submit.mutate('APPROVED')} disabled={submit.isPending}>
                    Подходит
                  </Button>
                  <Button variant="ghost" onClick={() => submit.mutate('REJECTED')} disabled={submit.isPending}>
                    Не подходит
                  </Button>
                </div>
              ) : (
                <Button onClick={() => submit.mutate(undefined)} disabled={submit.isPending}>Отправить</Button>
              )}
              {submit.isError ? <div className="text-sm text-rose-600">{(submit.error as Error).message}</div> : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
