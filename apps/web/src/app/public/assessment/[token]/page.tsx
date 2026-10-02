'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, Textarea } from '@/components/ui';
import { QuestionField } from '@/components/question-field';
import { normalizeQuestions } from '@/lib/questions';

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
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [missing, setMissing] = useState<string | null>(null);
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

  const questions = normalizeQuestions(data?.questionnaire?.schema);
  const trySubmit = () => {
    const empty = questions.find((q) => {
      if (!q.required) return false;
      const v = answers[q.id];
      return v === undefined || v === '' || (Array.isArray(v) && !v.length);
    });
    if (empty) {
      setMissing(empty.id);
      document.getElementById(`q-${empty.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setMissing(null);
    submit.mutate();
  };

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
            <div className="text-[var(--sk-green-text)] font-semibold text-lg">Ответы сохранены. Спасибо!</div>
          </Card>
        ) : data ? (
          <Card className="p-6 space-y-6">
            {questions.some((q) => q.required) ? (
              <div className="text-xs text-[var(--sk-muted)]"><span className="text-[var(--sk-danger)]">*</span> — обязательный вопрос</div>
            ) : null}
            {questions.length ? (
              questions.map((q, i) => (
                <div key={q.id} id={`q-${q.id}`}>
                  <QuestionField
                    index={i}
                    question={q}
                    value={answers[q.id]}
                    onChange={(v) => {
                      setAnswers((s) => ({ ...s, [q.id]: v }));
                      if (missing === q.id) setMissing(null);
                    }}
                  />
                  {missing === q.id ? <div role="alert" className="text-xs text-[var(--sk-danger)] mt-1">Ответьте на этот вопрос</div> : null}
                </div>
              ))
            ) : (
              <Textarea
                value={answers.freeform || ''}
                onChange={(e) => setAnswers({ freeform: e.target.value })}
                placeholder="Свободный ответ"
              />
            )}
            <Button disabled={submit.isPending} onClick={trySubmit}>
              {submit.isPending ? 'Отправляем…' : 'Отправить ответы'}
            </Button>
            {submit.isError ? <div className="text-sm text-[var(--sk-danger)]">Не удалось отправить. Проверьте ответы и попробуйте ещё раз.</div> : null}
          </Card>
        ) : !error ? (
          <p className="text-[var(--sk-muted)] text-center">Загрузка…</p>
        ) : null}
      </div>
    </div>
  );
}
