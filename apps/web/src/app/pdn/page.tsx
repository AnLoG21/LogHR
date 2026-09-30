'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Input, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { PDN_DOC_TYPE_LABELS, ruLabel } from '@skillaz/shared';

export default function PdnPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['pdn'], queryFn: () => api<any[]>('/pdn') });
  const [edit, setEdit] = useState<{ type: string; title: string; content: string } | null>(null);
  const save = useMutation({
    mutationFn: () => api('/pdn', { method: 'POST', body: JSON.stringify(edit) }),
    onSuccess: () => { setEdit(null); qc.invalidateQueries({ queryKey: ['pdn'] }); },
  });

  return (
    <AppShell title="Персональные данные" subtitle="Политика и согласия кандидатов">
      <div className="space-y-4 max-w-3xl">
        {(list.data || []).map((d: any) => (
          <Card key={d.id} className="p-5">
            <div className="flex justify-between gap-3">
              <div>
                <div className="text-xs text-[var(--muted)]">{ruLabel(PDN_DOC_TYPE_LABELS, d.type)}</div>
                <div className="font-bold mt-1">{d.title}</div>
              </div>
              <Button variant="ghost" onClick={() => setEdit({ type: d.type, title: d.title, content: d.content })}>Редактировать</Button>
            </div>
            <div className="text-sm text-[var(--muted)] mt-3 whitespace-pre-wrap">{d.content}</div>
          </Card>
        ))}
        {!list.isLoading && !(list.data || []).length ? <Empty text="Документов нет" /> : null}
        {edit ? (
          <Card className="p-5 space-y-3">
            <div className="font-bold">Редактирование: {ruLabel(PDN_DOC_TYPE_LABELS, edit.type)}</div>
            <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <Textarea value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>Сохранить</Button>
              <Button variant="ghost" onClick={() => setEdit(null)}>Отмена</Button>
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
