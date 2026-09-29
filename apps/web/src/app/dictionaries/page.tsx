'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';

export default function DictionariesPage() {
  const qc = useQueryClient();
  const [addFor, setAddFor] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['dictionaries'], queryFn: () => api<any[]>('/dictionaries') });
  const add = useMutation({
    mutationFn: (body: { value: string; label: string }) =>
      api(`/dictionaries/${addFor}/items`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setAddFor(null); qc.invalidateQueries({ queryKey: ['dictionaries'] }); },
  });

  return (
    <AppShell title="Справочники" subtitle="Стандартные и дополнительные справочники">
      <div className="space-y-4">
        {(list.data || []).map((d: any) => (
          <Card key={d.id} className="p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold">{d.name}</div>
              <Button variant="ghost" onClick={() => setAddFor(d.id)}>Добавить значение</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(d.items || []).map((i: any) => (
                <span key={i.id} className="text-xs px-2 py-1 rounded bg-[var(--surface-2)]">{i.label || i.value}</span>
              ))}
              {!d.items?.length ? <span className="text-sm text-[var(--muted)]">Пусто</span> : null}
            </div>
          </Card>
        ))}
        {!list.isLoading && !(list.data || []).length ? <Empty text="Справочников нет — запустите seed" /> : null}
      </div>
      <Modal open={!!addFor} title="Новое значение" onClose={() => setAddFor(null)}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          add.mutate({ value: String(fd.get('value')), label: String(fd.get('label') || fd.get('value')) });
        }}>
          <Input name="value" placeholder="Код" required />
          <Input name="label" placeholder="Подпись" required />
          <Button type="submit" disabled={add.isPending}>Сохранить</Button>
        </form>
      </Modal>
    </AppShell>
  );
}
