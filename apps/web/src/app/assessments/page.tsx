'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Icon, Input, Modal, Select } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import clsx from 'clsx';
import { ASSIGNMENT_STATUS_LABELS, QUESTIONNAIRE_TYPE_LABELS, ruLabel } from '@skillaz/shared';
import {
  QuestionnaireBuilder,
  draftToPayload,
  emptyQuestion,
  validateDraft,
  type QuestionnaireDraft,
} from '@/components/questionnaire-builder';
import { QUESTION_TYPE_LABELS, formatAnswer, normalizeQuestions, questionWord } from '@/lib/questions';

export default function AssessmentsPage() {
  return (
    <Suspense fallback={<AppShell title="Оценка"><div className="text-[var(--sk-muted)]">Загрузка…</div></AppShell>}>
      <AssessmentsInner />
    </Suspense>
  );
}

type Tab = 'quiz' | 'scenarios' | 'assign';

function publicLink(token: string) {
  return typeof window === 'undefined' ? `/public/assessment/${token}` : `${window.location.origin}/public/assessment/${token}`;
}

function AssessmentsInner() {
  const sp = useSearchParams();
  const initial: Tab = sp.get('tab') === 'scenarios' ? 'scenarios' : sp.get('tab') === 'assign' ? 'assign' : 'quiz';
  const [tab, setTab] = useState<Tab>(initial);
  const qc = useQueryClient();

  const [editor, setEditor] = useState<{ id?: string; draft: QuestionnaireDraft } | null>(null);
  const [editorError, setEditorError] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);
  const [scenarioForm, setScenarioForm] = useState<{ id?: string; name: string; funnelStageId: string; questionnaireId: string } | null>(null);
  const [assignForm, setAssignForm] = useState<{ candidateId: string; questionnaireId: string } | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [copied, setCopied] = useState('');

  const questionnaires = useQuery({ queryKey: ['questionnaires'], queryFn: () => api<any[]>('/assessments/questionnaires') });
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api<any[]>('/assessments/scenarios') });
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: () => api<any[]>('/assessments/assignments') });
  const candidates = useQuery({ queryKey: ['candidates-mini'], queryFn: () => api<any>('/candidates?pageSize=200') });
  const funnels = useQuery({ queryKey: ['funnels'], queryFn: () => api<any[]>('/funnels') });

  const quizzes = useMemo(() => questionnaires.data || [], [questionnaires.data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['questionnaires'] });
    qc.invalidateQueries({ queryKey: ['scenarios'] });
    qc.invalidateQueries({ queryKey: ['assignments'] });
  };

  const saveQ = useMutation({
    mutationFn: ({ id, draft }: { id?: string; draft: QuestionnaireDraft }) =>
      api(id ? `/assessments/questionnaires/${id}` : '/assessments/questionnaires', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(draftToPayload(draft)),
      }),
    onSuccess: () => {
      setEditor(null);
      refresh();
    },
    onError: (e: Error) => setEditorError(e.message),
  });
  const duplicateQ = useMutation({
    mutationFn: (id: string) => api(`/assessments/questionnaires/${id}/duplicate`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const removeQ = useMutation({
    mutationFn: (id: string) => api(`/assessments/questionnaires/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const saveS = useMutation({
    mutationFn: (f: NonNullable<typeof scenarioForm>) =>
      api(f.id ? `/assessments/scenarios/${f.id}` : '/assessments/scenarios', {
        method: f.id ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: f.name, funnelStageId: f.funnelStageId, questionnaireId: f.questionnaireId }),
      }),
    onSuccess: () => {
      setScenarioForm(null);
      refresh();
    },
  });
  const removeS = useMutation({
    mutationFn: (id: string) => api(`/assessments/scenarios/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const assign = useMutation({
    mutationFn: (body: { candidateId: string; questionnaireId: string }) =>
      api('/assessments/assign', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setAssignForm(null);
      refresh();
      setTab('assign');
    },
  });
  const removeA = useMutation({
    mutationFn: (id: string) => api(`/assessments/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const openCreate = () => {
    setEditorError('');
    setEditor({ draft: { name: '', type: 'TEST', questions: [emptyQuestion()] } });
  };
  const openEdit = (q: any) => {
    setEditorError('');
    setViewId(null);
    setEditor({ id: q.id, draft: { name: q.name, type: q.type, questions: normalizeQuestions(q.schema) } });
  };
  const submitEditor = () => {
    if (!editor) return;
    const err = validateDraft(editor.draft);
    if (err) return setEditorError(err);
    setEditorError('');
    saveQ.mutate(editor);
  };

  const copy = (token: string) => {
    navigator.clipboard?.writeText(publicLink(token));
    setCopied(token);
    setTimeout(() => setCopied(''), 1500);
  };

  const viewQ = quizzes.find((q: any) => q.id === viewId);
  const resultA = (assignments.data || []).find((a: any) => a.id === resultId);
  const title = tab === 'scenarios' ? 'Сценарии' : tab === 'assign' ? 'Назначения' : 'Опросники';

  return (
    <AppShell
      title={title}
      subtitle="Тесты и анкеты для кандидатов: создайте опросник, отправьте ссылку и смотрите ответы"
      actions={
        <>
          <Button variant="ghost" onClick={() => setAssignForm({ candidateId: '', questionnaireId: '' })} disabled={!quizzes.length}>
            Отправить кандидату
          </Button>
          {tab === 'scenarios' ? (
            <Button onClick={() => setScenarioForm({ name: '', funnelStageId: '', questionnaireId: '' })} disabled={!quizzes.length}>
              <Icon name="plus" className="w-4 h-4" /> Добавить сценарий
            </Button>
          ) : (
            <Button onClick={openCreate}>
              <Icon name="plus" className="w-4 h-4" /> Новый опросник
            </Button>
          )}
        </>
      }
    >
      <div className="flex border-b border-[var(--sk-line)] mb-4">
        {[
          { id: 'quiz' as const, label: `Опросники (${quizzes.length})` },
          { id: 'scenarios' as const, label: `Сценарии (${(scenarios.data || []).length})` },
          { id: 'assign' as const, label: `Назначения (${(assignments.data || []).length})` },
        ].map((t) => (
          <button key={t.id} className={clsx('sk-tab', tab === t.id && 'active')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'quiz' ? (
        <div className="space-y-3">
          {quizzes.map((q: any) => {
            const n = normalizeQuestions(q.schema).length;
            return (
              <Card key={q.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" className="text-left min-w-0" onClick={() => setViewId(q.id)}>
                    <div className="text-[16px] font-bold hover:underline">{q.name}</div>
                    <div className="mt-1 text-[13px] text-[var(--sk-muted)]">
                      {ruLabel(QUESTIONNAIRE_TYPE_LABELS, q.type)} · {n} {questionWord(n)} · отправлен {q._count?.assignments ?? 0} раз
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setViewId(q.id)}><Icon name="eye" className="w-4 h-4" /> Открыть</Button>
                    <Button variant="ghost" onClick={() => openEdit(q)}><Icon name="edit" className="w-4 h-4" /> Изменить</Button>
                    <button type="button" className="sk-btn sk-btn-icon" title="Создать копию" aria-label="Создать копию" onClick={() => duplicateQ.mutate(q.id)} disabled={duplicateQ.isPending}>
                      <Icon name="copy" className="w-4 h-4" />
                    </button>
                    <ConfirmDelete iconOnly question="Удалить опросник?" onConfirm={() => removeQ.mutate(q.id)} pending={removeQ.isPending} />
                  </div>
                </div>
              </Card>
            );
          })}
          <ErrorText error={removeQ.error || duplicateQ.error} />
          {!questionnaires.isLoading && !quizzes.length ? (
            <Card className="p-8 text-center">
              <div className="font-semibold">Опросников пока нет</div>
              <div className="text-sm text-[var(--sk-muted)] mt-1">Создайте первый — например, короткий скрининг перед собеседованием</div>
              <Button className="mt-4" onClick={openCreate}><Icon name="plus" className="w-4 h-4" /> Новый опросник</Button>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'scenarios' ? (
        <div className="space-y-3">
          <div className="text-[13px] text-[var(--sk-muted)]">
            Сценарий автоматически отправляет опросник, когда кандидат переходит на выбранный этап воронки.
          </div>
          {(scenarios.data || []).map((s: any) => (
            <Card key={s.id} className="p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[16px] font-bold">{s.name}</div>
                <div className="text-[13px] text-[var(--sk-muted)] mt-1">
                  Этап «{s.funnelStage?.name || '—'}»{s.funnelStage?.funnel?.name ? ` (${s.funnelStage.funnel.name})` : ''} → «{s.questionnaire?.name || '—'}»
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setScenarioForm({ id: s.id, name: s.name, funnelStageId: s.funnelStageId, questionnaireId: s.questionnaireId })}
                >
                  <Icon name="edit" className="w-4 h-4" /> Изменить
                </Button>
                <ConfirmDelete iconOnly question="Удалить сценарий?" onConfirm={() => removeS.mutate(s.id)} pending={removeS.isPending} />
              </div>
            </Card>
          ))}
          <ErrorText error={removeS.error} />
          {!scenarios.isLoading && !scenarios.data?.length ? <Empty text="Сценариев нет" /> : null}
        </div>
      ) : null}

      {tab === 'assign' ? (
        <div className="space-y-2">
          {(assignments.data || []).map((a: any) => {
            const done = a.status === 'COMPLETED';
            return (
              <Card key={a.id} className="p-4 flex flex-wrap justify-between gap-3 text-sm items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.candidate ? (
                      <Link href={`/candidates/${a.candidate.id}`} className="font-semibold sk-link">{fullName(a.candidate)}</Link>
                    ) : (
                      <span className="font-semibold">—</span>
                    )}
                    <Badge color={done ? 'green' : 'amber'}>{ruLabel(ASSIGNMENT_STATUS_LABELS, a.status)}</Badge>
                  </div>
                  <div className="text-[var(--sk-muted)] text-xs mt-1">
                    {a.questionnaire?.name} · отправлен {new Date(a.createdAt).toLocaleDateString('ru-RU')}
                    {a.completedAt ? ` · ответил ${new Date(a.completedAt).toLocaleDateString('ru-RU')}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {done ? (
                    <Button onClick={() => setResultId(a.id)}>Смотреть ответы</Button>
                  ) : a.externalToken ? (
                    <Button variant="ghost" onClick={() => copy(a.externalToken)}>
                      <Icon name="link" className="w-4 h-4" /> {copied === a.externalToken ? 'Скопировано' : 'Скопировать ссылку'}
                    </Button>
                  ) : null}
                  <ConfirmDelete iconOnly label="Отменить назначение" question={done ? 'Удалить вместе с ответами?' : 'Отменить?'} onConfirm={() => removeA.mutate(a.id)} pending={removeA.isPending} />
                </div>
              </Card>
            );
          })}
          <ErrorText error={removeA.error} />
          {!assignments.isLoading && !assignments.data?.length ? <Empty text="Опросники ещё никому не отправлялись" /> : null}
        </div>
      ) : null}

      <Modal open={!!editor} title={editor?.id ? 'Изменить опросник' : 'Новый опросник'} onClose={() => setEditor(null)} maxWidth={760}>
        {editor ? (
          <div className="flex flex-col gap-4">
            {editor.id && (viewQ?._count?.assignments || quizzes.find((q: any) => q.id === editor.id)?._count?.assignments) ? (
              <div className="rounded-lg bg-[var(--sk-info-soft)] p-3 text-[13px]">
                Опросник уже отправлялся кандидатам. Уже полученные ответы сохранятся, но удалённые вопросы в них не будут показаны.
              </div>
            ) : null}
            <QuestionnaireBuilder value={editor.draft} onChange={(draft) => setEditor({ ...editor, draft })} />
            {editorError ? <div role="alert" className="text-sm text-[var(--sk-text-danger)]">{editorError}</div> : null}
            <div className="flex justify-end gap-2 border-t border-[var(--sk-line)] pt-4">
              <Button variant="ghost" onClick={() => setEditor(null)}>Отмена</Button>
              <Button onClick={submitEditor} disabled={saveQ.isPending}>{saveQ.isPending ? 'Сохраняем…' : 'Сохранить'}</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!viewQ} title={viewQ?.name || ''} onClose={() => setViewId(null)} maxWidth={680}>
        {viewQ ? (
          <div className="flex flex-col gap-4">
            <div className="text-[13px] text-[var(--sk-muted)]">
              {ruLabel(QUESTIONNAIRE_TYPE_LABELS, viewQ.type)} · отправлен {viewQ._count?.assignments ?? 0} раз · сценариев: {viewQ._count?.scenarios ?? 0}
            </div>
            <ol className="flex flex-col gap-3 m-0 p-0 list-none">
              {normalizeQuestions(viewQ.schema).map((q, i) => (
                <li key={q.id} className="rounded-lg border border-[var(--sk-line)] p-3">
                  <div className="text-sm font-semibold">
                    {i + 1}. {q.text}
                    {q.required ? <span className="text-[var(--sk-danger)] ml-1">*</span> : null}
                  </div>
                  <div className="text-xs text-[var(--sk-muted)] mt-1">{QUESTION_TYPE_LABELS[q.type]}</div>
                  {q.options?.length ? (
                    <ul className="mt-2 ml-4 text-[13px] list-disc">
                      {q.options.map((o) => <li key={o}>{o}</li>)}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--sk-line)] pt-4">
              <Button variant="ghost" onClick={() => { setViewId(null); setAssignForm({ candidateId: '', questionnaireId: viewQ.id }); }}>
                Отправить кандидату
              </Button>
              <Button onClick={() => openEdit(viewQ)}><Icon name="edit" className="w-4 h-4" /> Изменить</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!resultA} title={resultA?.candidate ? `Ответы: ${fullName(resultA.candidate)}` : 'Ответы'} onClose={() => setResultId(null)} maxWidth={680}>
        {resultA ? <AssignmentResult assignment={resultA} /> : null}
      </Modal>

      <Modal open={!!scenarioForm} title={scenarioForm?.id ? 'Изменить сценарий' : 'Новый сценарий'} onClose={() => setScenarioForm(null)}>
        {scenarioForm ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveS.mutate(scenarioForm);
            }}
          >
            <Field label="Название">
              <Input value={scenarioForm.name} onChange={(e) => setScenarioForm({ ...scenarioForm, name: e.target.value })} placeholder="Например: Тест после скрининга" required />
            </Field>
            <Field label="Когда отправлять" hint="Опросник уйдёт кандидату при переходе на этот этап">
              <Select value={scenarioForm.funnelStageId} onChange={(e) => setScenarioForm({ ...scenarioForm, funnelStageId: e.target.value })} required>
                <option value="">Выберите этап</option>
                {(funnels.data || []).map((f: any) => (
                  <optgroup key={f.id} label={f.name}>
                    {(f.stages || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Какой опросник">
              <Select value={scenarioForm.questionnaireId} onChange={(e) => setScenarioForm({ ...scenarioForm, questionnaireId: e.target.value })} required>
                <option value="">Выберите опросник</option>
                {quizzes.map((q: any) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </Select>
            </Field>
            <ErrorText error={saveS.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setScenarioForm(null)}>Отмена</Button>
              <Button type="submit" disabled={saveS.isPending}>Сохранить</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!assignForm} title="Отправить опросник кандидату" onClose={() => setAssignForm(null)}>
        {assignForm ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              assign.mutate(assignForm);
            }}
          >
            <Field label="Кандидат">
              <Select value={assignForm.candidateId} onChange={(e) => setAssignForm({ ...assignForm, candidateId: e.target.value })} required>
                <option value="">Выберите кандидата</option>
                {(candidates.data?.items || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{fullName(c)}{c.vacancy?.title ? ` — ${c.vacancy.title}` : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Опросник">
              <Select value={assignForm.questionnaireId} onChange={(e) => setAssignForm({ ...assignForm, questionnaireId: e.target.value })} required>
                <option value="">Выберите опросник</option>
                {quizzes.map((q: any) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </Select>
            </Field>
            <div className="text-xs text-[var(--sk-muted)]">После отправки появится ссылка — её можно скопировать и переслать кандидату.</div>
            <ErrorText error={assign.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAssignForm(null)}>Отмена</Button>
              <Button type="submit" disabled={assign.isPending}>Отправить</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </AppShell>
  );
}

function AssignmentResult({ assignment }: { assignment: any }) {
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