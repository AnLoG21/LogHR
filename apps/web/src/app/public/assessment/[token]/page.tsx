'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, Input, Textarea } from '@/components/ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function publicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function PublicAssessmentPage() {
  const { token } = useParams<{ token: string }>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { data, error } = useQuery({
    queryKey: ['public-assessment', token],
    queryFn: () => publicApi<any>(`/assessments/public/${token}`),
  });
  const submit = useMutation({
    mutationFn: () =>
      publicApi(`/assessments/public/${token}`, {
        method: 'POST',
        body: JSON.stringify({ answers, submittedAt: new Date().toISOString() }),
      }),
  });

  const questions: { id: string; text: string; type?: string }[] =
    data?.questionnaire?.schema?.questions || [];

  return (
    <div className="min-h-screen" style={{ background: 'var(--sk-bg)' }}>
      <div className="bg-[var(--sk-header)] text-white px-6 py-10">
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/75">Таймыр Инвест</div>
        <h1 className="text-3xl font-extrabold mt-2">{data?.questionnaire?.name || 'Опросник'}</h1>
        {data?.candidate ? (
          <p className="text-white/70 mt-2 text-sm">
            {data.candidate.lastName} {data.candidate.firstName}
          </p>
        ) : null}
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {error ? <p className="text-[var(--sk-danger)]">Ссылка недействительна или истекла</p> : null}
        {data?.status === 'COMPLETED' || submit.isSuccess ? (
          <Card className="p-6 text-center">
            <div className="text-[var(--sk-green)] font-semibold text-lg">Ответы сохранены. Спасибо!</div>
          </Card>
        ) : data ? (
          <Card className="p-6 space-y-4">
            {questions.length ? (
              questions.map((q) => (
                <div key={q.id}>
                  <div className="text-sm font-semibold mb-2">{q.text}</div>
                  {q.type === 'textarea' ? (
                    <Textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      placeholder="Ваш ответ"
                    />
                  ) : (
                    <Input
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      placeholder="Ваш ответ"
                    />
                  )}
                </div>
              ))
            ) : (
              <Textarea
                value={answers.freeform || ''}
                onChange={(e) => setAnswers({ freeform: e.target.value })}
                placeholder="Свободный ответ"
              />
            )}
            <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
              Отправить
            </Button>
            {submit.isError ? <div className="text-sm text-[var(--sk-danger)]">Не удалось отправить</div> : null}
          </Card>
        ) : !error ? (
          <p className="text-[var(--sk-muted)] text-center">Загрузка…</p>
        ) : null}
      </div>
    </div>
  );
}
