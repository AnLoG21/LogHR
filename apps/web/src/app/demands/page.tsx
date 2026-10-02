'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Icon, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';

type DemandForm = { id?: string; orgUnitId: string; candidateProfileId: string; positionsCount: string; comment: string; title?: string };

export default function DemandsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<DemandForm | null>(null);
  const list = useQuery({ queryKey: ['demands'], queryFn: () => api<any>('/demands?pageSize=100') });
  const orgUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=100') });
  const profiles = useQuery({ queryKey: ['profiles-mini'], queryFn: () => api<any>('/profiles?pageSize=100') });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['demands'] });
    qc.invalidateQueries({ queryKey: ['requests'] });
  };
  const save = useMutation({
    mutationFn: (f: DemandForm) =>
      f.id
        ? api(`/demands/${f.id}`, { method: 'PATCH', body: JSON.stringify({ positionsCount: Number(f.positionsCount), comment: f.comment }) })
        : api('/demands', {
            method: 'POST',
            body: JSON.stringify({
              orgUnitId: f.orgUnitId,
              candidateProfileId: f.candidateProfileId,
              positionsCount: Number(f.positionsCount || 1),
              comment: f.comment || undefined,
              autoCreateRequest: true,
            }),
          }),
    onSuccess: () => { setForm(null); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/demands/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setForm(null); refresh(); },
  });

  const items = list.data?.items || [];
  return (
    <AppShell
      title="Потребности"
      subtitle="Сколько людей нужно в каждом подразделении. Новая потребность автоматически создаёт заявку на подбор"
      actions={<Button onClick={() => setForm({ orgUnitId: '', candidateProfileId: '', positionsCount: '1', comment: '' })}><Icon name="plus" className="w-4 h-4" /> Добавить потребность</Button>}
    >
      <div className="space-y-3">
        {items.map((d: any) => (
          <Card key={d.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold">{d.candidateProfile?.name} · {d.orgUnit?.name}</div>
              <div className="text-sm text-[var(--sk-muted)] mt-1">Позиций: {d.positionsCount} · Заявок: {d._count?.hiringRequests ?? 0}</div>
              {d.comment ? <div className="text-sm mt-2 whitespace-pre-wrap">{d.comment}</div> : null}
            </div>
            <Button
              variant="ghost"
              onClick={() => setForm({
                id: d.id,
                orgUnitId: d.orgUnitId,
                candidateProfileId: d.candidateProfileId,
                positionsCount: String(d.positionsCount),
                comment: d.comment || '',
                title: `${d.candidateProfile?.name || ''} · ${d.orgUnit?.name || ''}`,
              })}
            >
              <Icon name="edit" className="w-4 h-4" /> Изменить
            </Button>
          </Card>
        ))}
        {!list.isLoading && !items.length ? <Empty text="Потребностей нет" /> : null}
      </div>

      <Modal open={!!form} title={form?.id ? 'Изменить потребность' : 'Новая потребность'} onClose={() => setForm(null)}>
        {form ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            {form.id ? (
              <div className="text-sm font-semibold">{form.title}</div>
            ) : (
              <>
                <Field label="Подразделение">
                  <Select value={form.orgUnitId} onChange={(e) => setForm({ ...form, orgUnitId: e.target.value })} required>
                    <option value="">Выберите подразделение</option>
                    {(orgUnits.data?.items || []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                </Field>
                <Field label="Профиль (должность)">
                  <Select value={form.candidateProfileId} onChange={(e) => setForm({ ...form, candidateProfileId: e.target.value })} required>
                    <option value="">Выберите профиль</option>
                    {(profiles.data?.items || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
              </>
            )}
            <Field label="Количество позиций">
              <Input type="number" min={0} value={form.positionsCount} onChange={(e) => setForm({ ...form, positionsCount: e.target.value })} required />
            </Field>
            <Field label="Комментарий">
              <Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
            </Field>
            <ErrorText error={save.error || remove.error} />
            <div className="flex flex-wrap justify-between gap-2">
              {form.id ? (
                <ConfirmDelete
                  question="Удалить потребность? Связанные заявки останутся."
                  onConfirm={() => remove.mutate(form.id!)}
                  pending={remove.isPending}
                />
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
