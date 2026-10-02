'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Icon, Input, Modal, Textarea } from '@/components/ui';
import { api } from '@/lib/api';

type ProfileForm = { id?: string; name: string; department: string; grade: string; description: string; isActive?: boolean };

export default function ProfilesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const list = useQuery({
    queryKey: ['profiles', search, showArchived],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: '100' });
      if (search) p.set('search', search);
      if (showArchived) p.set('archived', 'true');
      return api<any>(`/profiles?${p}`);
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['profiles'] });
    qc.invalidateQueries({ queryKey: ['profiles-mini'] });
  };
  const save = useMutation({
    mutationFn: (f: ProfileForm) =>
      api(f.id ? `/profiles/${f.id}` : '/profiles', {
        method: f.id ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: f.name, department: f.department, grade: f.grade, description: f.description }),
      }),
    onSuccess: () => { setForm(null); refresh(); },
  });
  const archive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/profiles/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => { setForm(null); refresh(); },
  });

  const items = list.data?.items || [];
  return (
    <AppShell
      title="Профили кандидатов"
      subtitle="Типовые должности: на их основе создаются заявки и вакансии"
      actions={<Button onClick={() => setForm({ name: '', department: '', grade: '', description: '' })}><Icon name="plus" className="w-4 h-4" /> Новый профиль</Button>}
    >
      <Card className="p-4 mb-4 flex flex-wrap gap-3 items-center">
        <Input placeholder="Поиск по названию" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск по названию" className="flex-1 min-w-[200px]" />
        <label className="text-sm flex items-center gap-2 text-[var(--sk-muted)]">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Показать архив
        </label>
      </Card>
      <div className="space-y-3">
        {items.map((p: any) => (
          <Card key={p.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold">{p.name}{!p.isActive ? ' · архив' : ''}</div>
              <div className="text-sm text-[var(--sk-muted)] mt-1">{p.department || 'Подразделение не указано'} · {p.grade || 'без грейда'}</div>
              {p.description ? <div className="text-sm mt-2 whitespace-pre-wrap">{p.description}</div> : null}
            </div>
            <Button
              variant="ghost"
              onClick={() => setForm({ id: p.id, name: p.name, department: p.department || '', grade: p.grade || '', description: p.description || '', isActive: p.isActive })}
            >
              <Icon name="edit" className="w-4 h-4" /> Изменить
            </Button>
          </Card>
        ))}
        {!list.isLoading && !items.length ? <Empty text={search ? 'Ничего не найдено' : showArchived ? 'В архиве пусто' : 'Профилей пока нет'} /> : null}
      </div>

      <Modal open={!!form} title={form?.id ? 'Изменить профиль' : 'Новый профиль'} onClose={() => setForm(null)}>
        {form ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            <Field label="Должность">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Водитель самосвала" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Направление">
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Например: Транспорт" />
              </Field>
              <Field label="Грейд">
                <Input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="Например: Специалист" />
              </Field>
            </div>
            <Field label="Описание">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Обязанности и требования" />
            </Field>
            <ErrorText error={save.error || archive.error} />
            <div className="flex flex-wrap justify-between gap-2">
              {form.id ? (
                form.isActive === false ? (
                  <Button type="button" variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate({ id: form.id!, isActive: true })}>
                    Вернуть из архива
                  </Button>
                ) : (
                  <ConfirmDelete
                    label="В архив"
                    question="Убрать профиль в архив? Существующие заявки и вакансии останутся."
                    onConfirm={() => archive.mutate({ id: form.id!, isActive: false })}
                    pending={archive.isPending}
                  />
                )
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>Отмена</Button>
                <Button type="submit" disabled={save.isPending}>Сохранить</Button>
              </div>
            </div>
          </form>
        ) : null}
      </Modal>
    </AppShell>
  );
}
