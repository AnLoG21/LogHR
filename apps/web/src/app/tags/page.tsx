'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';

export default function TagsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ['tags'], queryFn: () => api<any[]>('/tags') });
  const create = useMutation({
    mutationFn: (body: any) => api('/tags', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['tags'] }); },
  });

  return (
    <AppShell title="Теги" subtitle="Категории и теги кандидатов" actions={<Button onClick={() => setOpen(true)}>Добавить тег</Button>}>
      <div className="space-y-4">
        {(list.data || []).map((cat: any) => (
          <Card key={cat.id} className="p-4">
            <div className="font-bold mb-2">{cat.name}</div>
            <div className="flex flex-wrap gap-2">
              {(cat.tags || []).map((t: any) => (
                <span key={t.id} className="text-xs px-2 py-1 rounded-full border border-[var(--line)]">{t.name}</span>
              ))}
              {!cat.tags?.length ? <span className="text-sm text-[var(--muted)]">Нет тегов</span> : null}
            </div>
          </Card>
        ))}
        {!list.isLoading && !(list.data || []).length ? <Empty text="Категорий нет" /> : null}
      </div>
      <Modal open={open} title="Новый тег" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          create.mutate({ categoryId: fd.get('categoryId'), name: fd.get('name') });
        }}>
          <Select name="categoryId" required defaultValue="">
            <option value="">Категория</option>
            {(list.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input name="name" placeholder="Название тега" required />
          <Button type="submit" disabled={create.isPending}>Создать</Button>
        </form>
      </Modal>
    </AppShell>
  );
}
