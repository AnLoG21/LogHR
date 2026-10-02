'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Icon, Input, Modal, Select, Textarea } from '@/components/ui';
import { api, fullName } from '@/lib/api';

type Filter = 'OPEN' | 'DONE' | 'CANCELLED' | 'ALL';
type TaskForm = { id?: string; title: string; description: string; assigneeId: string; dueAt: string; candidateId: string };

const STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'В работе', color: 'amber' },
  DONE: { label: 'Выполнена', color: 'green' },
  CANCELLED: { label: 'Отменена', color: 'slate' },
};

function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TasksPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [mine, setMine] = useState(true);
  const [form, setForm] = useState<TaskForm | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter, mine],
    queryFn: () => api<any>(`/tasks?pageSize=100&status=${filter}&mine=${mine}`),
  });
  const users = useQuery({ queryKey: ['users-directory'], queryFn: () => api<any[]>('/users/directory') });
  const candidates = useQuery({ queryKey: ['candidates-mini'], queryFn: () => api<any>('/candidates?pageSize=200') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasks'] });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: (f: TaskForm) =>
      api(f.id ? `/tasks/${f.id}` : '/tasks', {
        method: f.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: f.title,
          description: f.description,
          assigneeId: f.assigneeId || undefined,
          candidateId: f.candidateId || (f.id ? '' : undefined),
          dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : f.id ? '' : undefined,
        }),
      }),
    onSuccess: () => { setForm(null); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setForm(null); refresh(); },
  });

  const items = data?.items || [];
  const now = Date.now();

  return (
    <AppShell
      title="Задачи"
      subtitle="Напоминания по кандидатам и заявкам: позвонить, отправить оффер, проверить документы"
      actions={
        <Button onClick={() => setForm({ title: '', description: '', assigneeId: '', dueAt: '', candidateId: '' })}>
          <Icon name="plus" className="w-4 h-4" /> Новая задача
        </Button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex border-b border-[var(--sk-line)]">
          {([
            ['OPEN', 'В работе'],
            ['DONE', 'Выполненные'],
            ['CANCELLED', 'Отменённые'],
            ['ALL', 'Все'],
          ] as [Filter, string][]).map(([id, label]) => (
            <button key={id} type="button" className={clsx('sk-tab', filter === id && 'active')} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="w-4 h-4" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Только мои
        </label>
      </div>

      <ErrorText error={setStatus.error} />
      <Card className="divide-y divide-[var(--sk-line)]">
        {items.map((t: any) => {
          const overdue = t.status === 'OPEN' && t.dueAt && new Date(t.dueAt).getTime() < now;
          const st = STATUS[t.status] || STATUS.OPEN;
          return (
            <div key={t.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                {t.status === 'OPEN' ? (
                  <button
                    type="button"
                    className="mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 border-[var(--sk-field-border)] hover:border-[var(--sk-green-strong)]"
                    title="Отметить выполненной"
                    aria-label={`Отметить выполненной: ${t.title}`}
                    onClick={() => setStatus.mutate({ id: t.id, status: 'DONE' })}
                  />
                ) : (
                  <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-[var(--sk-green-strong)] text-white grid place-items-center text-xs">✓</span>
                )}
                <div className="min-w-0">
                  <div className={clsx('font-semibold text-sm', t.status !== 'OPEN' && 'line-through text-[var(--sk-muted)]')}>{t.title}</div>
                  <div className="text-xs text-[var(--sk-muted)] mt-1 flex flex-wrap gap-x-2">
                    {t.candidate ? <Link href={`/candidates/${t.candidate.id}`} className="sk-link">{fullName(t.candidate)}</Link> : null}
                    {t.hiringRequest ? <Link href={`/requests/${t.hiringRequest.id}`} className="sk-link">{t.hiringRequest.title}</Link> : null}
                    {t.dueAt ? (
                      <span style={overdue ? { color: 'var(--sk-text-danger)', fontWeight: 600 } : undefined}>
                        {overdue ? 'Просрочена · ' : 'Срок · '}
                        {new Date(t.dueAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : null}
                    {t.assignee ? <span>Исполнитель: {t.assignee.lastName} {t.assignee.firstName}</span> : null}
                  </div>
                  {t.description ? <div className="text-[13px] mt-1 whitespace-pre-wrap">{t.description}</div> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={st.color}>{st.label}</Badge>
                {t.status !== 'OPEN' ? (
                  <Button variant="ghost" onClick={() => setStatus.mutate({ id: t.id, status: 'OPEN' })}>Вернуть в работу</Button>
                ) : null}
                <button
                  type="button"
                  className="sk-btn sk-btn-icon"
                  title="Изменить"
                  aria-label="Изменить задачу"
                  onClick={() =>
                    setForm({
                      id: t.id,
                      title: t.title,
                      description: t.description || '',
                      assigneeId: t.assigneeId || '',
                      dueAt: toLocalInput(t.dueAt),
                      candidateId: t.candidateId || '',
                    })
                  }
                >
                  <Icon name="edit" className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        {!isLoading && !items.length ? (
          <Empty text={filter === 'OPEN' ? 'Задач в работе нет — отличная работа' : 'Задач нет'} />
        ) : null}
      </Card>

      <Modal open={!!form} title={form?.id ? 'Изменить задачу' : 'Новая задача'} onClose={() => setForm(null)}>
        {form ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            <Field label="Что сделать">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Например: Позвонить и уточнить дату выхода" required />
            </Field>
            <Field label="Подробности">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Необязательно" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Срок">
                <Input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
              </Field>
              <Field label="Исполнитель">
                <Select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                  <option value="">Я</option>
                  {(users.data || []).map((u: any) => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Кандидат">
              <Select value={form.candidateId} onChange={(e) => setForm({ ...form, candidateId: e.target.value })}>
                <option value="">Без кандидата</option>
                {(candidates.data?.items || []).map((c: any) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
              </Select>
            </Field>
            <ErrorText error={save.error || remove.error} />
            <div className="flex flex-wrap justify-between gap-2">
              {form.id ? (
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => { setStatus.mutate({ id: form.id!, status: 'CANCELLED' }); setForm(null); }}>
                    Отменить задачу
                  </Button>
                  <ConfirmDelete question="Удалить задачу?" onConfirm={() => remove.mutate(form.id!)} pending={remove.isPending} />
                </div>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>Закрыть</Button>
                <Button type="submit" disabled={save.isPending}>Сохранить</Button>
              </div>
            </div>
          </form>
        ) : null}
      </Modal>
    </AppShell>
  );
}
