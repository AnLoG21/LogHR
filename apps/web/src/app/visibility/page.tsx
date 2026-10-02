'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, SystemRole } from '@skillaz/shared';
import { AppShell, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Icon, Input, Modal, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { autoCode } from '@/lib/slug';

const SCOPES = [
  { value: 'all', label: 'Всё в системе', hint: 'Как у администратора — без ограничений' },
  { value: 'orgUnit', label: 'Своё подразделение', hint: 'Кандидаты и заявки своего подразделения' },
  { value: 'assigned', label: 'Только назначенные мне', hint: 'Где я рекрутер, менеджер или ответственный' },
  { value: 'checks', label: 'Проверки СБ', hint: 'Доступ к кандидатам с проверками' },
];

function scopeLabel(scope?: string) {
  return SCOPES.find((s) => s.value === scope || (scope === 'own_org' && s.value === 'orgUnit'))?.label || 'По роли по умолчанию';
}

type ProfileForm = { id?: string; name: string; scope: string; description: string };

const userName = (u: any) => [u.lastName, u.firstName].filter(Boolean).join(' ') || u.email || 'Без имени';

export default function VisibilityPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const list = useQuery({ queryKey: ['visibility'], queryFn: () => api<any[]>('/visibility') });
  const details = useQuery({
    queryKey: ['visibility', form?.id],
    queryFn: () => api<any>(`/visibility/${form!.id}`),
    enabled: !!form?.id,
  });
  const directory = useQuery({ queryKey: ['users-directory'], queryFn: () => api<any[]>('/users/directory'), enabled: !!form?.id });

  const refresh = () => qc.invalidateQueries({ queryKey: ['visibility'] });

  const save = useMutation({
    mutationFn: (f: ProfileForm) =>
      f.id
        ? api(`/visibility/${f.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: f.name.trim(), rules: { scope: f.scope, description: f.description } }),
          })
        : api('/visibility', {
            method: 'POST',
            body: JSON.stringify({
              name: f.name.trim(),
              code: autoCode(f.name, 'VIS'),
              rules: { scope: f.scope, description: f.description },
            }),
          }),
    onSuccess: () => { setForm(null); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/visibility/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setForm(null); refresh(); },
  });
  const assign = useMutation({
    mutationFn: ({ userId, profileId }: { userId: string; profileId: string | null }) =>
      api('/visibility/assign', { method: 'POST', body: JSON.stringify({ userId, visibilityProfileId: profileId }) }),
    onSuccess: () => { setAddUserId(''); refresh(); qc.invalidateQueries({ queryKey: ['users'] }); },
  });

  const assigned: any[] = details.data?.users || [];
  const assignedIds = new Set(assigned.map((u) => u.id));
  const candidatesToAdd = (directory.data || []).filter((u) => !assignedIds.has(u.id));

  return (
    <AppShell
      title="Профили видимости"
      subtitle="Кто каких кандидатов и какие заявки видит в списках"
      actions={<Button onClick={() => setForm({ name: '', scope: 'orgUnit', description: '' })}><Icon name="plus" className="w-4 h-4" /> Добавить профиль</Button>}
    >
      <div className="space-y-3">
        {(list.data || []).map((p: any) => {
          const scope = p.rules?.scope;
          return (
            <Card key={p.id} className="p-4 flex flex-wrap justify-between gap-3 items-start">
              <div>
                <div className="font-bold">{p.name}</div>
                <div className="text-sm mt-1">{scopeLabel(scope)}</div>
                {p.rules?.description ? <div className="text-xs text-[var(--sk-muted)] mt-1">{p.rules.description}</div> : null}
                <div className="text-xs text-[var(--sk-muted)] mt-2">Пользователей: {p._count?.users ?? 0}</div>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setAddUserId('');
                  setForm({
                    id: p.id,
                    name: p.name,
                    scope: scope === 'own_org' ? 'orgUnit' : scope || 'orgUnit',
                    description: p.rules?.description || '',
                  });
                }}
              >
                <Icon name="edit" className="w-4 h-4" /> Изменить
              </Button>
            </Card>
          );
        })}
        {!list.isLoading && !(list.data || []).length ? <Empty text="Профилей пока нет — создайте первый" /> : null}
      </div>

      <Modal open={!!form} title={form?.id ? 'Изменить профиль видимости' : 'Новый профиль видимости'} onClose={() => setForm(null)}>
        {form ? (
          <div className="flex flex-col gap-4">
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <Field label="Название">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Рекрутеры Норильска" required />
              </Field>
              <Field label="Что видит пользователь" hint={SCOPES.find((s) => s.value === form.scope)?.hint}>
                <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                  {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </Field>
              <Field label="Комментарий" hint="Необязательно">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <ErrorText error={save.error || remove.error} />
              <div className="flex flex-wrap justify-between gap-2">
                {form.id ? (
                  <ConfirmDelete
                    question="Удалить профиль? У пользователей останутся права по их роли."
                    onConfirm={() => remove.mutate(form.id!)}
                    pending={remove.isPending}
                  />
                ) : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setForm(null)}>Отмена</Button>
                  <Button type="submit" disabled={!form.name.trim() || save.isPending}>Сохранить</Button>
                </div>
              </div>
            </form>

            {form.id ? (
              <div className="border-t border-[var(--sk-line)] pt-4">
                <div className="font-semibold text-sm mb-2">Пользователи с этим профилем</div>
                {details.isLoading ? <div className="text-sm text-[var(--sk-muted)]">Загрузка…</div> : null}
                <ul className="flex flex-col gap-1 mb-3">
                  {assigned.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 text-sm py-1">
                      <span className="min-w-0">
                        {userName(u)}
                        <span className="text-xs text-[var(--sk-muted)] ml-2">{ROLE_LABELS[u.role as SystemRole] || ''}</span>
                      </span>
                      <button
                        type="button"
                        className="sk-btn sk-btn-icon"
                        aria-label={`Убрать ${userName(u)}`}
                        disabled={assign.isPending}
                        onClick={() => assign.mutate({ userId: u.id, profileId: null })}
                      >
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                  {!details.isLoading && !assigned.length ? <li className="text-sm text-[var(--sk-muted)]">Пока никому не назначен</li> : null}
                </ul>
                <div className="flex gap-2">
                  <Select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} aria-label="Добавить пользователя" className="flex-1">
                    <option value="">Выберите пользователя</option>
                    {candidatesToAdd.map((u) => (
                      <option key={u.id} value={u.id}>{userName(u)} — {ROLE_LABELS[u.role as SystemRole] || u.role}</option>
                    ))}
                  </Select>
                  <Button type="button" disabled={!addUserId || assign.isPending} onClick={() => assign.mutate({ userId: addUserId, profileId: form.id! })}>
                    Добавить
                  </Button>
                </div>
                <div className="text-xs text-[var(--sk-muted)] mt-1">У пользователя может быть только один профиль — при добавлении прежний заменится.</div>
                <ErrorText error={assign.error} />
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
