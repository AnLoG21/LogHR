'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Input, Modal, Textarea } from '@/components/ui';
import { api } from '@/lib/api';

type QuickReply = {
  id: string;
  text: string;
  sortOrder: number;
  isActive: boolean;
};

export default function QuickRepliesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');

  const list = useQuery({
    queryKey: ['max-quick-replies-all'],
    queryFn: () => api<QuickReply[]>('/integrations/max/quick-replies/all'),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        text: text.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      };
      if (editId) {
        return api(`/integrations/max/quick-replies/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      return api('/integrations/max/quick-replies', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      setOpen(false);
      setEditId(null);
      setText('');
      setError('');
      qc.invalidateQueries({ queryKey: ['max-quick-replies-all'] });
      qc.invalidateQueries({ queryKey: ['max-quick-replies'] });
    },
    onError: (e: any) => setError(e?.message || 'Не удалось сохранить'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/integrations/max/quick-replies/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['max-quick-replies-all'] });
      qc.invalidateQueries({ queryKey: ['max-quick-replies'] });
    },
  });

  const openCreate = () => {
    setEditId(null);
    setText('');
    setSortOrder(String((list.data || []).length));
    setIsActive(true);
    setError('');
    setOpen(true);
  };

  const openEdit = (row: QuickReply) => {
    setEditId(row.id);
    setText(row.text);
    setSortOrder(String(row.sortOrder));
    setIsActive(row.isActive);
    setError('');
    setOpen(true);
  };

  return (
    <AppShell
      title="Быстрые ответы MAX"
      subtitle="Шаблоны для чата с кандидатами — без деплоя"
      actions={<Button onClick={openCreate}>Добавить</Button>}
    >
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--sk-soft)] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold w-16">№</th>
              <th className="px-4 py-3 font-semibold">Текст</th>
              <th className="px-4 py-3 font-semibold w-28">Статус</th>
              <th className="px-4 py-3 font-semibold w-40 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {(list.data || []).map((row) => (
              <tr key={row.id} className="hover:bg-[var(--sk-hover)]">
                <td className="px-4 py-3 text-[var(--sk-muted)]">{row.sortOrder}</td>
                <td className="px-4 py-3 whitespace-pre-wrap">{row.text}</td>
                <td className="px-4 py-3">
                  <Badge color={row.isActive ? 'green' : 'amber'}>{row.isActive ? 'Активен' : 'Скрыт'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Button variant="ghost" onClick={() => openEdit(row)}>Изменить</Button>
                    <ConfirmDelete
                      question="Удалить быстрый ответ?"
                      onConfirm={() => remove.mutate(row.id)}
                      pending={remove.isPending}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.isLoading && !(list.data || []).length ? <Empty text="Быстрых ответов пока нет" /> : null}
      </Card>

      <Modal
        open={open}
        title={editId ? 'Изменить ответ' : 'Новый ответ'}
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          <Field label="Текст">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
          </Field>
          <Field label="Порядок">
            <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Показывать в чате
          </label>
          <ErrorText error={error} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button disabled={!text.trim() || save.isPending} onClick={() => save.mutate()}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
