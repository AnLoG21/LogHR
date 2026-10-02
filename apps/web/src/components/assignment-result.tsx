'use client';

import { formatAnswer, normalizeQuestions } from '@/lib/questions';

export function assessmentLink(token: string) {
  return typeof window === 'undefined' ? `/public/assessment/${token}` : `${window.location.origin}/public/assessment/${token}`;
}

export function AssignmentResult({ assignment }: { assignment: any }) {
  const questions = normalizeQuestions(assignment.questionnaire?.schema);
  const answers = assignment.result?.answers || {};
  const known = new Set(questions.map((q) => q.id));
  const extra = Object.entries(answers).filter(([k]) => !known.has(k));
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] text-[var(--sk-muted)]">
        «{assignment.questionnaire?.name}» · ответил {assignment.completedAt ? new Date(assignment.completedAt).toLocaleString('ru-RU') : '—'}
      </div>
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border border-[var(--sk-line)] p-3">
          <div className="text-[13px] text-[var(--sk-muted)]">{i + 1}. {q.text}</div>
          <div className="text-sm mt-1 whitespace-pre-wrap font-medium">{formatAnswer(q, answers[q.id])}</div>
        </div>
      ))}
      {extra.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-[var(--sk-line)] p-3">
          <div className="text-[13px] text-[var(--sk-muted)]">{k === 'freeform' ? 'Свободный ответ' : 'Ответ на удалённый вопрос'}</div>
          <div className="text-sm mt-1 whitespace-pre-wrap">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</div>
        </div>
      ))}
    </div>
  );
}
