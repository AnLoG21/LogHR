'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function publicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function PublicOfferPage() {
  const { token } = useParams<{ token: string }>();
  const { data, error } = useQuery({
    queryKey: ['public-offer', token],
    queryFn: () => publicApi<any>(`/offers/public/${token}`),
  });
  const respond = useMutation({
    mutationFn: (accept: boolean) =>
      publicApi(`/offers/public/${token}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }),
  });

  return (
    <div className="min-h-screen">
      <div className="bg-[var(--brand-primary)] text-white px-6 py-10">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Таймыр Инвест</div>
        <h1 className="text-3xl font-extrabold mt-2">Предложение о работе</h1>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {error ? <p className="text-[var(--danger)]">Ссылка недействительна</p> : null}
        {data ? (
          <Card className="p-6 space-y-4 max-w-xl mx-auto">
            <div className="text-sm text-[var(--muted)]">Кандидат</div>
            <div className="text-2xl font-extrabold text-[var(--brand-primary)]">
              {data.candidate?.lastName} {data.candidate?.firstName}
            </div>
            <div className="text-sm space-y-1">
              <div>Должность: <strong>{data.position || '—'}</strong></div>
              <div>Оклад: <strong>{data.salary ? `${data.salary} ${data.currency}` : '—'}</strong></div>
              <div className="pt-2 whitespace-pre-wrap">{data.conditions}</div>
            </div>
            {respond.isSuccess ? (
              <div className="text-[var(--success)] font-semibold">Ответ зафиксирован</div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => respond.mutate(true)}>Принять</Button>
                <Button variant="ghost" onClick={() => respond.mutate(false)}>Отклонить</Button>
              </div>
            )}
          </Card>
        ) : !error ? <p className="text-[var(--muted)] text-center">Загрузка…</p> : null}
      </div>
    </div>
  );
}
