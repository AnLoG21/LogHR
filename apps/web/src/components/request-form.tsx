'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HIRING_REQUEST_TRANSITIONS, HiringRequestStatus } from '@skillaz/shared';
import { Button, ErrorText, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface RequestFormValue {
  id?: string;
  title: string;
  orgUnitId: string;
  candidateProfileId: string;
  positionsCount: number;
  priority: string;
  city: string;
  comment: string;
  recruiterId: string;
  hiringManagerId: string;
}

export function requestToForm(r?: any): RequestFormValue {
  return {
    id: r?.id,
    title: r?.title || '',
    orgUnitId: r?.orgUnitId || r?.orgUnit?.id || '',
    candidateProfileId: r?.candidateProfileId || r?.candidateProfile?.id || '',
    positionsCount: r?.positionsCount || 1,
    priority: r?.priority || 'MEDIUM',
    city: r?.city || '',
    comment: r?.comment || '',
    recruiterId: r?.recruiterId || r?.recruiter?.id || '',
    hiringManagerId: r?.hiringManagerId || r?.hiringManager?.id || '',
  };
}

export function RequestFormModal({ value, onClose }: { value: RequestFormValue | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<RequestFormValue | null>(value);
  useEffect(() => setF(value), [value]);

  const orgUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=200'), enabled: !!value });
  const profiles = useQuery({ queryKey: ['profiles-mini'], queryFn: () => api<any>('/profiles?pageSize=200'), enabled: !!value });
  const users = useQuery({ queryKey: ['users-directory'], queryFn: () => api<any[]>('/users/directory'), enabled: !!value });

  const save = useMutation({
    mutationFn: (v: RequestFormValue) =>
      api(v.id ? `/hiring-requests/${v.id}` : '/hiring-requests', {
        method: v.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: v.title,
          orgUnitId: v.orgUnitId,
          candidateProfileId: v.candidateProfileId,
          positionsCount: Number(v.positionsCount) || 1,
          priority: v.priority,
          city: v.city || (v.id ? '' : undefined),
          comment: v.comment || (v.id ? '' : undefined),
          recruiterId: v.recruiterId || (v.id ? '' : undefined),
          hiringManagerId: v.hiringManagerId || (v.id ? '' : undefined),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['request'] });
      onClose();
    },
  });

  const people = users.data || [];
  return (
    <Modal open={!!value} title={value?.id ? 'Изменить заявку' : 'Новая заявка'} onClose={onClose} maxWidth={560}>
      {f ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(f); }}>
          <Field label="Название">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Например: Водители самосвалов на участок" required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Подразделение">
              <Select value={f.orgUnitId} onChange={(e) => setF({ ...f, orgUnitId: e.target.value })} required>
                <option value="">Выберите</option>
                {(orgUnits.data?.items || []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="Профиль кандидата">
              <Select value={f.candidateProfileId} onChange={(e) => setF({ ...f, candidateProfileId: e.target.value })} required>
                <option value="">Выберите</option>
                {(profiles.data?.items || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Сколько человек нужно">
              <Input type="number" min={1} value={f.positionsCount} onChange={(e) => setF({ ...f, positionsCount: Number(e.target.value) })} />
            </Field>
            <Field label="Приоритет">
              <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
                <option value="LOW">Низкий</option>
                <option value="MEDIUM">Средний</option>
                <option value="HIGH">Высокий</option>
              </Select>
            </Field>
            <Field label="Город">
              <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Если отличается от города подразделения" />
            </Field>
            <Field label="Рекрутер">
              <Select value={f.recruiterId} onChange={(e) => setF({ ...f, recruiterId: e.target.value })}>
                <option value="">Не назначен</option>
                {people.map((u: any) => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
              </Select>
            </Field>
            <Field label="Нанимающий менеджер">
              <Select value={f.hiringManagerId} onChange={(e) => setF({ ...f, hiringManagerId: e.target.value })}>
                <option value="">Не назначен</option>
                {people.map((u: any) => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Комментарий">
            <Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} placeholder="Требования, график, особенности" />
          </Field>
          <ErrorText error={save.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

const ACTION_LABELS: Record<string, string> = {
  PENDING_HR_BP: 'На согласование',
  APPROVED_HR_BP: 'Согласовать',
  REJECTED_HR_BP: 'Отклонить',
  IN_PROGRESS: 'Взять в работу',
  PAUSED: 'Приостановить',
  CANCELLED: 'Отменить',
  CLOSED: 'Закрыть',
  NEW: 'Вернуть в черновик',
};
const PRIMARY = new Set(['PENDING_HR_BP', 'APPROVED_HR_BP', 'IN_PROGRESS', 'CLOSED']);

export function RequestStatusActions({ request }: { request: any }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const change = useMutation({
    mutationFn: (status: string) =>
      api(`/hiring-requests/${request.id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['request'] });
    },
  });
  const canApprove = user?.role === 'ADMIN' || user?.role === 'HR_BP';
  const next = (HIRING_REQUEST_TRANSITIONS[request.status as HiringRequestStatus] || []).filter(
    (s) => canApprove || (s !== 'APPROVED_HR_BP' && s !== 'REJECTED_HR_BP'),
  );
  if (!next.length) return null;
  return (
    <>
      {next.map((s) => (
        <Button key={s} variant={PRIMARY.has(s) ? 'primary' : 'ghost'} disabled={change.isPending} onClick={() => change.mutate(s)}>
          {ACTION_LABELS[s] || s}
        </Button>
      ))}
      {change.error ? <ErrorText error={change.error} /> : null}
    </>
  );
}
