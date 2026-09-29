'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';

export default function DemandsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ['demands'], queryFn: () => api<any>('/demands?pageSize=100') });
  const orgUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=100') });
  const profiles = useQuery({ queryKey: ['profiles-mini'], queryFn: () => api<any>('/profiles?pageSize=100') });
  const create = useMutation({
    mutationFn: (body: any) => api('/demands', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['demands'] }); },
  });

  return (
    <AppShell title="Потребности" subtitle="Штатная потребность по орг. единицам" actions={<Button onClick={() => setOpen(true)}>Добавить потребность</Button>}>
      <div className="space-y-3">
        {(list.data?.items || []).map((d: any) => (
          <Card key={d.id} className="p-4">
            <div className="font-bold">{d.candidateProfile?.name} · {d.orgUnit?.name}</div>
            <div className="text-sm text-[var(--muted)] mt-1">Позиций: {d.positionsCount} · Заявок: {d._count?.hiringRequests ?? 0}</div>
            {d.comment ? <div className="text-sm mt-2">{d.comment}</div> : null}
          </Card>
        ))}
        {!list.isLoading && !(list.data?.items || []).length ? <Empty text="Потребностей нет" /> : null}
      </div>
      <Modal open={open} title="Новая потребность" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          create.mutate({
            orgUnitId: fd.get('orgUnitId'),
            candidateProfileId: fd.get('candidateProfileId'),
            positionsCount: Number(fd.get('positionsCount') || 1),
            comment: fd.get('comment') || undefined,
            autoCreateRequest: true,
          });
        }}>
          <Select name="orgUnitId" required defaultValue=""><option value="">Орг. единица</option>{(orgUnits.data?.items || []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          <Select name="candidateProfileId" required defaultValue=""><option value="">Профиль</option>{(profiles.data?.items || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Input name="positionsCount" type="number" min={1} defaultValue={1} placeholder="Количество" required />
          <Input name="comment" placeholder="Комментарий" />
          <Button type="submit" disabled={create.isPending}>Создать</Button>
        </form>
      </Modal>
    </AppShell>
  );
}
