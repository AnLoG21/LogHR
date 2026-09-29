'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';

export default function ProfilesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const list = useQuery({
    queryKey: ['profiles', search],
    queryFn: () => api<any>(`/profiles?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });
  const create = useMutation({
    mutationFn: (body: any) => api('/profiles', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['profiles'] }); },
  });

  return (
    <AppShell title="Профили кандидатов" subtitle="Шаблоны позиций для заявок и вакансий" actions={<Button onClick={() => setOpen(true)}>Добавить профиль</Button>}>
      <Card className="p-4 mb-4">
        <Input placeholder="Поиск по названию" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>
      <div className="space-y-3">
        {(list.data?.items || []).map((p: any) => (
          <Card key={p.id} className="p-4">
            <div className="font-bold">{p.name}</div>
            <div className="text-sm text-[var(--muted)] mt-1">{p.department || '—'} · {p.grade || 'без грейда'}</div>
            {p.description ? <div className="text-sm mt-2">{p.description}</div> : null}
          </Card>
        ))}
        {!list.isLoading && !(list.data?.items || []).length ? <Empty text="Профилей нет" /> : null}
      </div>
      <Modal open={open} title="Новый профиль" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          create.mutate({
            name: fd.get('name'),
            department: fd.get('department') || undefined,
            grade: fd.get('grade') || undefined,
            description: fd.get('description') || undefined,
          });
        }}>
          <Input name="name" placeholder="Название" required />
          <Input name="department" placeholder="Подразделение" />
          <Input name="grade" placeholder="Грейд" />
          <Input name="description" placeholder="Описание" />
          <Button type="submit" disabled={create.isPending}>Создать</Button>
        </form>
      </Modal>
    </AppShell>
  );
}
