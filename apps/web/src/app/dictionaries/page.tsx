'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, ConfirmDelete, ErrorText, Field, Icon, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { autoCode } from '@/lib/slug';
import { useAuth } from '@/lib/auth';

export default function DictionariesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [dictForm, setDictForm] = useState<{ id?: string; name: string } | null>(null);
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const list = useQuery({ queryKey: ['dictionaries'], queryFn: () => api<any[]>('/dictionaries') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['dictionaries'] });

  const saveDict = useMutation({
    mutationFn: (f: { id?: string; name: string }) =>
      api(f.id ? `/dictionaries/${f.id}` : '/dictionaries', {
        method: f.id ? 'PATCH' : 'POST',
        body: JSON.stringify(f.id ? { name: f.name } : { name: f.name, code: autoCode(f.name, 'DICT') }),
      }),
    onSuccess: () => { setDictForm(null); refresh(); },
  });
  const removeDict = useMutation({
    mutationFn: (id: string) => api(`/dictionaries/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const addItem = useMutation({
    mutationFn: ({ dictId, label }: { dictId: string; label: string }) =>
      api(`/dictionaries/${dictId}/items`, {
        method: 'POST',
        body: JSON.stringify({ value: autoCode(label, 'VAL').toLowerCase(), label }),
      }),
    onSuccess: (_d, v) => { setNewItem((s) => ({ ...s, [v.dictId]: '' })); refresh(); },
  });
  const updateItem = useMutation({
    mutationFn: (p: { id: string; label?: string; sortOrder?: number }) =>
      api(`/dictionaries/items/${p.id}`, { method: 'PATCH', body: JSON.stringify(p) }),
    onSuccess: () => { setEditing(null); refresh(); },
  });
  const removeItem = useMutation({
    mutationFn: (id: string) => api(`/dictionaries/items/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const move = (items: any[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const a = items[i];
    const b = items[j];
    updateItem.mutate({ id: a.id, sortOrder: j });
    updateItem.mutate({ id: b.id, sortOrder: i });
    items.forEach((it, k) => {
      if (k !== i && k !== j && it.sortOrder !== k) updateItem.mutate({ id: it.id, sortOrder: k });
    });
  };

  return (
    <AppShell
      title="Справочники"
      subtitle="Списки значений для форм и фильтров: города, причины отказа, источники и т.п."
      actions={<Button onClick={() => setDictForm({ name: '' })}><Icon name="plus" className="w-4 h-4" /> Новый справочник</Button>}
    >
      <div className="space-y-4">
        <ErrorText error={removeDict.error || addItem.error || updateItem.error || removeItem.error} />
        {(list.data || []).map((d: any) => {
          const items = d.items || [];
          return (
            <Card key={d.id} className="p-4">
              <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                <div>
                  <div className="font-bold">{d.name}</div>
                  <div className="text-xs text-[var(--sk-muted)]">{items.length} значений</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="sk-btn sk-btn-icon" title="Переименовать" aria-label="Переименовать справочник" onClick={() => setDictForm({ id: d.id, name: d.name })}>
                    <Icon name="edit" className="w-4 h-4" />
                  </button>
                  {user?.role === 'ADMIN' ? (
                    <ConfirmDelete iconOnly label="Удалить справочник" question="Удалить справочник со всеми значениями?" onConfirm={() => removeDict.mutate(d.id)} pending={removeDict.isPending} />
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col divide-y divide-[var(--sk-line)] rounded-lg border border-[var(--sk-line)]">
                {items.map((it: any, i: number) => {
                  const edit = editing?.id === it.id ? editing : null;
                  return (
                  <div key={it.id} className="flex items-center gap-2 px-3 py-1.5">
                    {edit ? (
                      <form
                        className="flex flex-1 gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const label = edit.label.trim();
                          if (label) updateItem.mutate({ id: it.id, label });
                        }}
                      >
                        <Input
                          value={edit.label}
                          onChange={(e) => setEditing({ id: it.id, label: e.target.value })}
                          autoFocus
                          style={{ height: 36 }}
                        />
                        <Button type="submit" disabled={updateItem.isPending}>Сохранить</Button>
                        <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
                      </form>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{it.label || it.value}</span>
                        <button type="button" className="sk-btn sk-btn-icon" title="Выше" aria-label="Переместить выше" disabled={i === 0} onClick={() => move(items, i, -1)}><Icon name="up" className="w-4 h-4" /></button>
                        <button type="button" className="sk-btn sk-btn-icon" title="Ниже" aria-label="Переместить ниже" disabled={i === items.length - 1} onClick={() => move(items, i, 1)}><Icon name="down" className="w-4 h-4" /></button>
                        <button type="button" className="sk-btn sk-btn-icon" title="Изменить" aria-label="Изменить значение" onClick={() => setEditing({ id: it.id, label: it.label || it.value })}><Icon name="edit" className="w-4 h-4" /></button>
                        <ConfirmDelete iconOnly label="Удалить значение" onConfirm={() => removeItem.mutate(it.id)} pending={removeItem.isPending} />
                      </>
                    )}
                  </div>
                );})}
                <form
                  className="flex gap-2 px-3 py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const label = (newItem[d.id] || '').trim();
                    if (label) addItem.mutate({ dictId: d.id, label });
                  }}
                >
                  <Input
                    value={newItem[d.id] || ''}
                    onChange={(e) => setNewItem((s) => ({ ...s, [d.id]: e.target.value }))}
                    placeholder="Новое значение — Enter, чтобы добавить"
                    style={{ height: 36 }}
                  />
                  <Button type="submit" variant="ghost" disabled={!(newItem[d.id] || '').trim() || addItem.isPending}>Добавить</Button>
                </form>
              </div>
            </Card>
          );
        })}
        {!list.isLoading && !(list.data || []).length ? (
          <Card className="p-8 text-center">
            <div className="font-semibold">Справочников пока нет</div>
            <div className="text-sm text-[var(--sk-muted)] mt-1">Создайте первый справочник, например «Причины отказа»</div>
            <Button className="mt-4" onClick={() => setDictForm({ name: '' })}><Icon name="plus" className="w-4 h-4" /> Новый справочник</Button>
          </Card>
        ) : null}
      </div>

      <Modal open={!!dictForm} title={dictForm?.id ? 'Переименовать справочник' : 'Новый справочник'} onClose={() => setDictForm(null)}>
        {dictForm ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveDict.mutate(dictForm); }}>
            <Field label="Название">
              <Input value={dictForm.name} onChange={(e) => setDictForm({ ...dictForm, name: e.target.value })} placeholder="Например: Причины отказа" required />
            </Field>
            <ErrorText error={saveDict.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDictForm(null)}>Отмена</Button>
              <Button type="submit" disabled={saveDict.isPending}>Сохранить</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </AppShell>
  );
}
