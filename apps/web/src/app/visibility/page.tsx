'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';

export default function VisibilityPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ['visibility'], queryFn: () => api<any[]>('/visibility') });
  const create = useMutation({
    mutationFn: (body: any) => api('/visibility', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['visibility'] }); },
  });

  return (
    <AppShell title="Профили видимости" subtitle="Ограничение доступа к объектам ATS" actions={<Button onClick={() => setOpen(true)}>Добавить</Button>}>
      <div className="space-y-3">
        {(list.data || []).map((p: any) => (
          <Card key={p.id} className="p-4">
            <div className="font-bold">{p.name}</div>
            <div className="text-xs text-[var(--muted)] mt-1">Код: {p.code} · пользователей: {p._count?.users ?? 0}</div>
            <pre className="text-xs mt-2 bg-[var(--surface-2)] p-2 rounded overflow-auto">{JSON.stringify(p.rules || {}, null, 2)}</pre>
          </Card>
        ))}
        {!list.isLoading && !(list.data || []).length ? <Empty text="Профилей нет — запустите seed" /> : null}
      </div>
      <Modal open={open} title="Новый профиль видимости" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const code = String(fd.get('code') || '').toUpperCase().replace(/\s+/g, '_');
          create.mutate({
            name: fd.get('name'),
            code,
            rules: { scope: 'orgUnit', description: fd.get('desc') || '' },
          });
        }}>
          <Input name="name" placeholder="Название" required />
          <Input name="code" placeholder="Код (RECRUITER_SCOPE)" required />
          <Input name="desc" placeholder="Описание правила" />
          <Button type="submit" disabled={create.isPending}>Создать</Button>
        </form>
      </Modal>
    </AppShell>
  );
}
