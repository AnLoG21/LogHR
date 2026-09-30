'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, Empty, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { CUSTOM_FIELD_ENTITY_LABELS, CUSTOM_FIELD_TYPE_LABELS, ruLabel } from '@skillaz/shared';

const ENTITIES = Object.entries(CUSTOM_FIELD_ENTITY_LABELS).map(([value, label]) => ({ value, label }));

export default function CustomFieldsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ entityType: 'VACANCY', code: '', label: '', fieldType: 'string' });
  const fields = useQuery({ queryKey: ['custom-fields'], queryFn: () => api<any[]>('/custom-fields') });
  const create = useMutation({
    mutationFn: () => api('/custom-fields', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setOpen(false);
      setForm({ entityType: 'VACANCY', code: '', label: '', fieldType: 'string' });
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/custom-fields/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  });

  return (
    <AppShell
      title="Кастомные поля"
      subtitle="Минимальный low-code: доп. поля сущностей (значения в extra JSON)"
      actions={<Button onClick={() => setOpen(true)}>Добавить поле</Button>}
    >
      <Card className="divide-y divide-[var(--line)]">
        {(fields.data || []).map((f) => (
          <div key={f.id} className="px-4 py-3 flex justify-between gap-3 text-sm items-center">
            <div>
              <div className="font-semibold">{f.label}</div>
              <div className="text-xs text-[var(--muted)]">{ruLabel(CUSTOM_FIELD_ENTITY_LABELS, f.entityType)} · {f.code} · {ruLabel(CUSTOM_FIELD_TYPE_LABELS, f.fieldType)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={f.isActive ? 'green' : 'amber'}>{f.isActive ? 'активно' : 'выкл'}</Badge>
              <Button variant="ghost" onClick={() => toggle.mutate({ id: f.id, isActive: !f.isActive })}>
                {f.isActive ? 'Выкл.' : 'Вкл.'}
              </Button>
            </div>
          </div>
        ))}
        {!fields.isLoading && !(fields.data || []).length ? (
          <Empty text="Полей пока нет — добавьте первое (аналог Table 1 модификаций ТЗ)" />
        ) : null}
      </Card>

      <Modal open={open} title="Новое поле" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
            {ENTITIES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </Select>
          <Input placeholder="Код (latin_snake)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input placeholder="Название" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Select value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}>
            {Object.entries(CUSTOM_FIELD_TYPE_LABELS).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
          </Select>
          <Button disabled={!form.code || !form.label || create.isPending} onClick={() => create.mutate()}>Создать</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
