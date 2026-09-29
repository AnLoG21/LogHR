'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Icon, Input, Modal, Select } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import clsx from 'clsx';

export default function AssessmentsPage() {
  return (
    <Suspense fallback={<AppShell title="Оценка"><div className="text-[var(--sk-muted)]">Загрузка…</div></AppShell>}>
      <AssessmentsInner />
    </Suspense>
  );
}

function AssessmentsInner() {
  const sp = useSearchParams();
  const initial = sp.get('tab') === 'scenarios' ? 'scenarios' : sp.get('tab') === 'assign' ? 'assign' : 'quiz';
  const [tab, setTab] = useState<'quiz' | 'scenarios' | 'assign'>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const qc = useQueryClient();

  const questionnaires = useQuery({ queryKey: ['questionnaires'], queryFn: () => api<any>('/assessments/questionnaires') });
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api<any>('/assessments/scenarios') });
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: () => api<any>('/assessments/assignments') });
  const candidates = useQuery({ queryKey: ['candidates-mini'], queryFn: () => api<any>('/candidates?pageSize=100') });
  const funnels = useQuery({ queryKey: ['funnels'], queryFn: () => api<any[]>('/funnels') });

  const createQ = useMutation({
    mutationFn: (body: any) => api('/assessments/questionnaires', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['questionnaires'] });
    },
  });

  const createS = useMutation({
    mutationFn: (body: any) => api('/assessments/scenarios', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['scenarios'] });
    },
  });

  const assign = useMutation({
    mutationFn: (body: any) => api('/assessments/assign', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowAssign(false);
      qc.invalidateQueries({ queryKey: ['assignments'] });
      setTab('assign');
    },
  });

  const title = tab === 'scenarios' ? 'Сценарии' : tab === 'assign' ? 'Назначения' : 'Опросники';
  const quizzes = useMemo(() => questionnaires.data || [], [questionnaires.data]);
  const stages = funnels.data?.[0]?.stages || [];

  return (
    <AppShell
      title={title}
      actions={
        <>
          <Button variant="ghost" onClick={() => setShowAssign(true)}>Назначить кандидату</Button>
          <Button onClick={() => setShowCreate(true)}>
            <Icon name="plus" className="w-4 h-4" />{' '}
            {tab === 'scenarios' ? 'Добавить сценарий' : 'Добавить опросник'}
          </Button>
        </>
      }
    >
      <div className="flex border-b border-[var(--sk-line)] mb-4">
        {[
          { id: 'quiz' as const, label: 'Опросники' },
          { id: 'scenarios' as const, label: 'Сценарии' },
          { id: 'assign' as const, label: 'Назначения' },
        ].map((t) => (
          <button key={t.id} className={clsx('sk-tab', tab === t.id && 'active')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'quiz' ? (
        <div className="space-y-3">
          <div className="text-[13px] text-[var(--sk-muted)] mb-1">Всего {quizzes.length} опросников</div>
          {quizzes.map((q: any) => (
            <Card key={q.id} className="p-5">
              <div className="text-[16px] font-bold">{q.name}</div>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-3 text-[13px]">
                <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40">Тип</span><span>{q.type}</span></div>
                <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40">Вопросов</span><span>{Array.isArray(q.schema?.questions) ? q.schema.questions.length : '—'}</span></div>
              </div>
            </Card>
          ))}
          {!questionnaires.isLoading && !quizzes.length ? <Empty text="Список пуст" /> : null}
        </div>
      ) : null}

      {tab === 'scenarios' ? (
        <div className="space-y-3">
          <div className="text-[13px] font-semibold mb-1">Всего {(scenarios.data || []).length} сценария</div>
          {(scenarios.data || []).map((s: any) => (
            <Card key={s.id} className="p-5">
              <div className="text-[16px] font-bold">{s.name}</div>
              <div className="text-[13px] text-[var(--sk-muted)] mt-1">
                {s.funnelStage?.name || '—'} → {s.questionnaire?.name || 'опросник'}
              </div>
            </Card>
          ))}
          {!scenarios.data?.length ? <Empty text="Список пуст" /> : null}
        </div>
      ) : null}

      {tab === 'assign' ? (
        <div className="space-y-2">
          {(assignments.data || []).map((a: any) => (
            <Card key={a.id} className="p-4 flex flex-wrap justify-between gap-2 text-sm items-center">
              <div>
                <div className="font-semibold">{a.candidate ? fullName(a.candidate) : '—'}</div>
                <div className="text-[var(--sk-muted)] text-xs">{a.questionnaire?.name} · {a.status}</div>
              </div>
              {a.externalToken ? (
                <a className="sk-link text-xs" href={`/public/assessment/${a.externalToken}`} target="_blank" rel="noreferrer">
                  Public-ссылка
                </a>
              ) : null}
            </Card>
          ))}
          {!assignments.data?.length ? <Empty text="Назначений нет" /> : null}
        </div>
      ) : null}

      <Modal
        open={showCreate}
        title={tab === 'scenarios' ? 'Новый сценарий' : 'Новый опросник'}
        onClose={() => setShowCreate(false)}
      >
        {tab === 'scenarios' ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              createS.mutate({
                name: fd.get('name'),
                funnelStageId: fd.get('funnelStageId'),
                questionnaireId: fd.get('questionnaireId'),
              });
            }}
          >
            <Input name="name" placeholder="Название сценария" required />
            <Select name="funnelStageId" required defaultValue="">
              <option value="">Этап воронки</option>
              {stages.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select name="questionnaireId" required defaultValue="">
              <option value="">Опросник</option>
              {quizzes.map((q: any) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </Select>
            <Button type="submit" disabled={createS.isPending}>Создать</Button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const q1 = String(fd.get('q1') || '').trim();
              const q2 = String(fd.get('q2') || '').trim();
              createQ.mutate({
                name: fd.get('name'),
                type: fd.get('type') || 'TEST',
                schema: {
                  questions: [q1, q2].filter(Boolean).map((text, i) => ({ id: `q${i + 1}`, text, type: 'text' })),
                },
              });
            }}
          >
            <Input name="name" placeholder="Название опросника" required />
            <Select name="type" defaultValue="TEST">
              <option value="TEST">Тест</option>
              <option value="VIDEO">Видео</option>
              <option value="HOMEWORK">Домашнее задание</option>
            </Select>
            <Input name="q1" placeholder="Вопрос 1" required />
            <Input name="q2" placeholder="Вопрос 2 (опционально)" />
            <Button type="submit" disabled={createQ.isPending}>Создать</Button>
          </form>
        )}
      </Modal>

      <Modal open={showAssign} title="Назначить опросник" onClose={() => setShowAssign(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            assign.mutate({
              candidateId: fd.get('candidateId'),
              questionnaireId: fd.get('questionnaireId'),
            });
          }}
        >
          <Select name="candidateId" required defaultValue="">
            <option value="">Кандидат</option>
            {(candidates.data?.items || []).map((c: any) => (
              <option key={c.id} value={c.id}>{fullName(c)}</option>
            ))}
          </Select>
          <Select name="questionnaireId" required defaultValue="">
            <option value="">Опросник</option>
            {quizzes.map((q: any) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </Select>
          <Button type="submit" disabled={assign.isPending}>Назначить</Button>
        </form>
      </Modal>
    </AppShell>
  );
}
