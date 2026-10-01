'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Button, Icon, Input, Select } from '@/components/ui';
import { QuestionField } from '@/components/question-field';
import { QUESTION_TYPE_LABELS, newQuestionId, type Question, type QuestionType } from '@/lib/questions';

export interface QuestionnaireDraft {
  name: string;
  type: string;
  questions: Question[];
}

export const QUESTIONNAIRE_KINDS = [
  { id: 'TEST', label: 'Тест' },
  { id: 'VIDEO', label: 'Видеоинтервью' },
  { id: 'HOMEWORK', label: 'Домашнее задание' },
];

export function emptyQuestion(type: QuestionType = 'text'): Question {
  return {
    id: newQuestionId(),
    text: '',
    type,
    required: false,
    options: type === 'single' || type === 'multi' ? ['', ''] : undefined,
  };
}

export function validateDraft(d: QuestionnaireDraft): string | null {
  if (!d.name.trim()) return 'Укажите название опросника';
  const qs = d.questions.filter((q) => q.text.trim());
  if (!qs.length) return 'Добавьте хотя бы один вопрос';
  for (const q of qs) {
    if ((q.type === 'single' || q.type === 'multi') && (q.options || []).filter((o) => o.trim()).length < 2) {
      return `В вопросе «${q.text}» нужно минимум два варианта ответа`;
    }
  }
  return null;
}

export function draftToPayload(d: QuestionnaireDraft) {
  return {
    name: d.name.trim(),
    type: d.type,
    schema: {
      questions: d.questions
        .filter((q) => q.text.trim())
        .map((q) => ({
          id: q.id,
          text: q.text.trim(),
          type: q.type,
          required: !!q.required,
          ...(q.type === 'single' || q.type === 'multi'
            ? { options: (q.options || []).map((o) => o.trim()).filter(Boolean) }
            : {}),
        })),
    },
  };
}

export function QuestionnaireBuilder({
  value,
  onChange,
}: {
  value: QuestionnaireDraft;
  onChange: (d: QuestionnaireDraft) => void;
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});
  const qs = value.questions;

  const setQ = (i: number, patch: Partial<Question>) => {
    const next = qs.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, questions: next });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= qs.length) return;
    const next = qs.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...value, questions: next });
  };
  const remove = (i: number) => onChange({ ...value, questions: qs.filter((_, k) => k !== i) });
  const duplicate = (i: number) => {
    const next = qs.slice();
    next.splice(i + 1, 0, { ...qs[i], id: newQuestionId(), options: qs[i].options ? [...qs[i].options!] : undefined });
    onChange({ ...value, questions: next });
  };
  const add = () => onChange({ ...value, questions: [...qs, emptyQuestion()] });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <label className="block">
          <span className="block text-xs text-[var(--sk-muted)] mb-1">Название</span>
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Например: Первичный скрининг водителя" autoFocus />
        </label>
        <label className="block">
          <span className="block text-xs text-[var(--sk-muted)] mb-1">Вид</span>
          <Select value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value })}>
            {QUESTIONNAIRE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </Select>
        </label>
      </div>

      <div className="flex border-b border-[var(--sk-line)]">
        <button type="button" className={clsx('sk-tab', mode === 'edit' && 'active')} onClick={() => setMode('edit')}>
          Вопросы ({qs.length})
        </button>
        <button type="button" className={clsx('sk-tab', mode === 'preview' && 'active')} onClick={() => setMode('preview')}>
          Как увидит кандидат
        </button>
      </div>

      {mode === 'preview' ? (
        <div className="flex flex-col gap-5 rounded-xl border border-[var(--sk-line)] bg-[var(--sk-soft)] p-5">
          {qs.filter((q) => q.text.trim()).length ? (
            qs.filter((q) => q.text.trim()).map((q, i) => (
              <QuestionField
                key={q.id}
                index={i}
                question={{ ...q, options: (q.options || []).filter((o) => o.trim()) }}
                value={previewAnswers[q.id]}
                onChange={(v) => setPreviewAnswers((s) => ({ ...s, [q.id]: v }))}
              />
            ))
          ) : (
            <div className="text-sm text-[var(--sk-muted)]">Добавьте вопросы, чтобы увидеть предпросмотр</div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {qs.map((q, i) => (
            <div key={q.id} className="rounded-xl border border-[var(--sk-line)] bg-[var(--sk-panel)] p-4">
              <div className="flex items-start gap-3">
                <div className="mt-2.5 w-6 shrink-0 text-sm font-semibold text-[var(--sk-muted)] tabular-nums">{i + 1}.</div>
                <div className="flex-1 min-w-0 flex flex-col gap-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_230px]">
                    <Input value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="Текст вопроса" aria-label={`Текст вопроса ${i + 1}`} />
                    <Select
                      value={q.type}
                      aria-label="Тип ответа"
                      onChange={(e) => {
                        const type = e.target.value as QuestionType;
                        const needsOptions = type === 'single' || type === 'multi';
                        setQ(i, { type, options: needsOptions ? (q.options?.length ? q.options : ['', '']) : undefined });
                      }}
                    >
                      {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
                        <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                      ))}
                    </Select>
                  </div>

                  {q.type === 'single' || q.type === 'multi' ? (
                    <div className="flex flex-col gap-2 pl-1">
                      {(q.options || []).map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className={clsx('w-4 h-4 shrink-0 border border-[var(--sk-field-border)]', q.type === 'single' ? 'rounded-full' : 'rounded')} />
                          <Input
                            value={o}
                            onChange={(e) => {
                              const opts = (q.options || []).slice();
                              opts[oi] = e.target.value;
                              setQ(i, { options: opts });
                            }}
                            placeholder={`Вариант ${oi + 1}`}
                            style={{ height: 36 }}
                          />
                          <button
                            type="button"
                            className="sk-btn sk-btn-icon"
                            title="Убрать вариант"
                            aria-label="Убрать вариант"
                            disabled={(q.options || []).length <= 2}
                            onClick={() => setQ(i, { options: (q.options || []).filter((_, k) => k !== oi) })}
                          >
                            <Icon name="x" className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="sk-link text-sm self-start" onClick={() => setQ(i, { options: [...(q.options || []), ''] })}>
                        + Добавить вариант
                      </button>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!q.required} onChange={(e) => setQ(i, { required: e.target.checked })} className="w-4 h-4" />
                      Обязательный вопрос
                    </label>
                    <div className="flex gap-1">
                      <button type="button" className="sk-btn sk-btn-icon" title="Выше" aria-label="Переместить выше" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" className="w-4 h-4" /></button>
                      <button type="button" className="sk-btn sk-btn-icon" title="Ниже" aria-label="Переместить ниже" disabled={i === qs.length - 1} onClick={() => move(i, 1)}><Icon name="down" className="w-4 h-4" /></button>
                      <button type="button" className="sk-btn sk-btn-icon" title="Дублировать" aria-label="Дублировать вопрос" onClick={() => duplicate(i)}><Icon name="copy" className="w-4 h-4" /></button>
                      <button type="button" className="sk-btn sk-btn-icon" title="Удалить вопрос" aria-label="Удалить вопрос" onClick={() => remove(i)} style={{ color: 'var(--sk-danger)' }}><Icon name="trash" className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <Button variant="ghost" onClick={add} className="self-start">+ Добавить вопрос</Button>
        </div>
      )}
    </div>
  );
}
