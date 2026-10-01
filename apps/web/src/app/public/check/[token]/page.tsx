'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, Textarea } from '@/components/ui';
import { CHECK_TYPE_LABELS, ruLabel } from '@skillaz/shared';

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
  const { data } = useQuery({
    queryKey: ['public-check', token],
    queryFn: () => publicApi<any>(`/checks/public/${token}`),
  });
  const submit = useMutation({
    mutationFn: () =>
      publicApi(`/checks/public/${token}`, {
        method: 'POST',
        body: JSON.stringify({ notes, submittedAt: new Date().toISOString() }),
      }),
  });

  return (
    <div className="min-h-screen">
      <div className="bg-[var(--brand-primary)] text-white px-6 py-10">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Таймыр Инвест</div>
        <h1 className="text-3xl font-extrabold mt-2">Форма проверки</h1>
      </div>
      <div className="max-w-xl mx-auto px-4 py-8">
        <Card className="p-6 space-y-4">
          <div className="text-sm">Тип: <strong>{ruLabel(CHECK_TYPE_LABELS, data?.type)}</strong></div>
          <div className="text-sm">Кандидат: <strong>{data?.candidate?.lastName} {data?.candidate?.firstName}</strong></div>
          <Textarea placeholder="Комментарий / данные анкеты" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {submit.isSuccess ? (
            <div className="text-[var(--success)] font-semibold">Отправлено</div>
          ) : (
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Отправить</Button>
          )}
        </Card>
      </div>
    </div>
  );
}
