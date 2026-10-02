'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Icon, Input, Modal, Select } from '@/components/ui';
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

  const remove = useMutation({
    mutationFn: (id: string) => api(`/custom-fields/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setOpen(false);
      setForm(emptyForm());
    },
  });

  const selectOptions = form.optionsText.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const canSave = !!form.label.trim() && (form.fieldType !== 'select' || selectOptions.length > 0);

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
              <Badge color={f.isActive ? 'green' : 'amber'}>{f.isActive ? 'включено' : 'выключено'}</Badge>
              <Button variant="ghost" onClick={() => toggle.mutate({ id: f.id, isActive: !f.isActive })}>
                {f.isActive ? 'Выключить' : 'Включить'}
              </Button>
              <button type="button" className="sk-btn sk-btn-icon" aria-label={`Изменить поле «${f.label}»`} onClick={() => openEdit(f)}>
                <Icon name="edit" className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {!fields.isLoading && !(fields.data || []).length ? (
          <Empty text="Полей пока нет — нажмите «Добавить поле»" />
        ) : null}
      </Card>

      <Modal open={open} title={form.id ? 'Изменить поле' : 'Новое поле'} onClose={() => setOpen(false)}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) (form.id ? save : create).mutate();
          }}
        >
          <Field label="Где показывать">
            {!form.id ? (
              <Select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
                {ENTITIES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </Select>
            ) : (
              <div className="text-sm">{ruLabel(CUSTOM_FIELD_ENTITY_LABELS, form.entityType)}</div>
            )}
          </Field>
          <Field label="Название поля">
            <Input placeholder="Например: Размер спецодежды" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
          </Field>
          <Field label="Тип значения">
            <Select value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}>
              {Object.entries(CUSTOM_FIELD_TYPE_LABELS).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
            </Select>
          </Field>
          {form.fieldType === 'select' ? (
            <Field label="Варианты" hint="Через запятую или с новой строки">
              <Input
                placeholder="Например: S, M, L, XL"
                value={form.optionsText}
                onChange={(e) => setForm({ ...form, optionsText: e.target.value })}
              />
            </Field>
          ) : null}
          <ErrorText error={create.error || save.error || remove.error} />
          <div className="flex flex-wrap justify-between gap-2">
            {form.id ? (
              <ConfirmDelete
                question="Удалить поле? Уже заполненные значения перестанут отображаться."
                onConfirm={() => remove.mutate(form.id!)}
                pending={remove.isPending}
              />
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
              <Button type="submit" disabled={!canSave || create.isPending || save.isPending}>
                {form.id ? 'Сохранить' : 'Создать'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
