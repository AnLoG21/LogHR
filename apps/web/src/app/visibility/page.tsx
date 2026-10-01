'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Input, Modal, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { autoCode } from '@/lib/slug';

const SCOPES = [
  { value: 'all', label: 'Всё в системе', hint: 'Как у администратора — без ограничений' },
  { value: 'orgUnit', label: 'Своё подразделение', hint: 'Кандидаты и заявки своего орг. юнита' },
  { value: 'assigned', label: 'Только назначенные мне', hint: 'Где я рекрутер, менеджер или ответственный' },
  { value: 'checks', label: 'Проверки СБ', hint: 'Доступ к кандидатам с проверками' },
];

function scopeLabel(scope?: string) {
  return SCOPES.find((s) => s.value === scope || (scope === 'own_org' && s.value === 'orgUnit'))?.label || 'По роли по умолчанию';
}

export default function VisibilityPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', scope: 'orgUnit', description: '' });
  const list = useQuery({ queryKey: ['visibility'], queryFn: () => api<any[]>('/visibility') });

  const create = useMutation({
    mutationFn: () =>
      api('/visibility', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          code: autoCode(form.name, 'VIS'),
          rules: { scope: form.scope, description: form.description },
        }),
      }),
    onSuccess: () => {
      setOpen(false);
      setForm({ name: '', scope: 'orgUnit', description: '' });
      qc.invalidateQueries({ queryKey: ['visibility'] });
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/visibility/${edit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: edit.name,
          rules: { scope: edit.scope, description: edit.description || '' },
        }),
      }),
    onSuccess: () => {
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['visibility'] });
    },
  });

  return (
    <AppShell
      title="Профили видимости"
      subtitle="Кто какие кандидаты и заявки видит в списке"
      actions={<Button onClick={() => setOpen(true)}>Добавить профиль</Button>}
    >
      <div className="space-y-3">
        {(list.data || []).map((p: any) => {
          const scope = p.rules?.scope;
          return (
            <Card key={p.id} className="p-4 flex flex-wrap justify-between gap-3 items-start">
              <div>
                <div className="font-bold">{p.name}</div>
                <div className="text-sm mt-1">{scopeLabel(scope)}</div>
                {p.rules?.description ? (
                  <div className="text-xs text-[var(--muted)] mt-1">{p.rules.description}</div>
                ) : null}
                <div className="text-xs text-[var(--muted)] mt-2">Пользователей: {p._count?.users ?? 0}</div>
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  setEdit({
                    id: p.id,
                    name: p.name,
                    scope: scope === 'own_org' ? 'orgUnit' : scope || 'orgUnit',
                    description: p.rules?.description || '',
                  })
                }
              >
                Изменить
              </Button>
            </Card>
          );
        })}
        {!list.isLoading && !(list.data || []).length ? (
          <Empty text="Профилей пока нет — создайте первый" />
        ) : null}
      </div>

      <Modal open={open} title="Новый профиль видимости" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="block text-sm">
            Область доступа
            <Select className="mt-1" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <div className="text-xs text-[var(--muted)] mt-1">{SCOPES.find((s) => s.value === form.scope)?.hint}</div>
          </label>
          <Textarea placeholder="Комментарий (необязательно)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button disabled={!form.name || create.isPending} onClick={() => create.mutate()}>Создать</Button>
        </div>
      </Modal>

      <Modal open={!!edit} title="Изменить профиль" onClose={() => setEdit(null)}>
        {edit ? (
          <div className="space-y-3">
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <label className="block text-sm">
              Область доступа
              <Select className="mt-1" value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value })}>
                {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </label>
            <Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <Button disabled={save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
