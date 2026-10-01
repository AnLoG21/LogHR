'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, Empty, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { autoCode } from '@/lib/slug';
import { CUSTOM_FIELD_ENTITY_LABELS, CUSTOM_FIELD_TYPE_LABELS, ruLabel } from '@skillaz/shared';

const ENTITIES = Object.entries(CUSTOM_FIELD_ENTITY_LABELS).map(([value, label]) => ({ value, label }));

type FieldForm = {
  id?: string;
  entityType: string;
  label: string;
  fieldType: string;
  optionsText: string;
  isActive?: boolean;
};

const emptyForm = (): FieldForm => ({
  entityType: 'VACANCY',
  label: '',
  fieldType: 'string',
  optionsText: '',
});

export default function CustomFieldsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FieldForm>(emptyForm());
  const fields = useQuery({ queryKey: ['custom-fields'], queryFn: () => api<any[]>('/custom-fields') });

  const create = useMutation({
    mutationFn: () =>
      api('/custom-fields', {
        method: 'POST',
        body: JSON.stringify({
          entityType: form.entityType,
          code: autoCode(form.label, 'FIELD'),
          label: form.label.trim(),
          fieldType: form.fieldType,
          options: form.fieldType === 'select'
            ? form.optionsText.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
            : undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setOpen(false);
      setForm(emptyForm());
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/custom-fields/${form.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: form.label.trim(),
          fieldType: form.fieldType,
          isActive: form.isActive,
          options: form.fieldType === 'select'
            ? form.optionsText.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
            : undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setOpen(false);
      setForm(emptyForm());
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/custom-fields/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  });

  function openCreate() {
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(f: any) {
    const opts = Array.isArray(f.options) ? f.options : [];
    setForm({
      id: f.id,
      entityType: f.entityType,
      label: f.label,
      fieldType: f.fieldType,
      optionsText: opts.join(', '),
      isActive: f.isActive,
    });
    setOpen(true);
  }

  return (
    <AppShell
      title="Дополнительные поля"
      subtitle="Свои поля для вакансий, заявок и кандидатов. Добавьте поле — оно появится в карточках."
      actions={<Button onClick={openCreate}>Добавить поле</Button>}
    >
      <Card className="divide-y divide-[var(--line)]">
        {(fields.data || []).map((f) => (
          <div key={f.id} className="px-4 py-3 flex justify-between gap-3 text-sm items-center">
            <button type="button" className="text-left min-w-0" onClick={() => openEdit(f)}>
              <div className="font-semibold hover:underline">{f.label}</div>
              <div className="text-xs text-[var(--muted)]">
                {ruLabel(CUSTOM_FIELD_ENTITY_LABELS, f.entityType)} · {ruLabel(CUSTOM_FIELD_TYPE_LABELS, f.fieldType)}
              </div>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <Badge color={f.isActive ? 'green' : 'amber'}>{f.isActive ? 'активно' : 'выкл'}</Badge>
              <Button variant="ghost" onClick={() => toggle.mutate({ id: f.id, isActive: !f.isActive })}>
                {f.isActive ? 'Выкл.' : 'Вкл.'}
              </Button>
            </div>
          </div>
        ))}
        {!fields.isLoading && !(fields.data || []).length ? (
          <Empty text="Полей пока нет — нажмите «Добавить поле»" />
        ) : null}
      </Card>

      <Modal open={open} title={form.id ? 'Изменить поле' : 'Новое поле'} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {!form.id ? (
            <Select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
              {ENTITIES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </Select>
          ) : (
            <div className="text-xs text-[var(--muted)]">{ruLabel(CUSTOM_FIELD_ENTITY_LABELS, form.entityType)}</div>
          )}
          <Input placeholder="Название поля" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Select value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}>
            {Object.entries(CUSTOM_FIELD_TYPE_LABELS).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
          </Select>
          {form.fieldType === 'select' ? (
            <Input
              placeholder="Варианты через запятую: Да, Нет, Возможно"
              value={form.optionsText}
              onChange={(e) => setForm({ ...form, optionsText: e.target.value })}
            />
          ) : null}
          <Button
            disabled={!form.label || create.isPending || save.isPending}
            onClick={() => (form.id ? save.mutate() : create.mutate())}
          >
            {form.id ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
