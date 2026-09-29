'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell, Badge, Button, Card, Empty, Input, Modal, Select, StageStrip, Textarea } from '@/components/ui';
import { api } from '@/lib/api';

export default function VacanciesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['vacancies'],
    queryFn: () => api<any>('/vacancies?pageSize=50'),
  });
  const profiles = useQuery({ queryKey: ['profiles-mini'], queryFn: () => api<any>('/profiles?pageSize=100') });
  const funnels = useQuery({ queryKey: ['funnels'], queryFn: () => api<any[]>('/funnels') });
  const orgUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=100') });

  const create = useMutation({
    mutationFn: (body: any) => api('/vacancies', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['vacancies'] });
    },
  });

  return (
    <AppShell
      title="Вакансии"
      subtitle="Точка сбора кандидатов и публикаций"
      actions={<Button onClick={() => setOpen(true)}>Новая вакансия</Button>}
    >
      <div className="grid md:grid-cols-2 gap-4">
        {(data?.items || []).map((v: any, i: number) => (
          <Link key={v.id} href={`/vacancies/${v.id}`} className="table-row-enter" style={{ animationDelay: `${i * 40}ms` }}>
            <Card className="p-4 hover:border-[var(--brand-secondary)] transition h-full">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-[var(--brand-primary)]">{v.title}</div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    {v.city || '—'} · {v.candidateProfile?.name}
                  </div>
                </div>
                <Badge color={v.isActive ? 'green' : 'slate'}>{v.isActive ? 'Активна' : 'Архив'}</Badge>
              </div>
              <div className="mt-3 flex gap-3 text-xs text-[var(--muted)]">
                <span>Кандидаты: {v._count?.candidates ?? 0}</span>
                <span>Заявки: {v._count?.hiringRequests ?? 0}</span>
                <span>Публикации: {v._count?.publications ?? 0}</span>
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">Воронка: {v.funnel?.name}</div>
            </Card>
          </Link>
        ))}
      </div>
      {!isLoading && !data?.items?.length ? <Empty text="Вакансий нет" /> : null}

      <Modal open={open} title="Создать вакансию" onClose={() => setOpen(false)}>
        <CreateVacancyForm
          profiles={profiles.data?.items || []}
          funnels={funnels.data || []}
          orgUnits={orgUnits.data?.items || []}
          busy={create.isPending}
          onSubmit={(b) => create.mutate(b)}
        />
      </Modal>
    </AppShell>
  );
}

function CreateVacancyForm({
  profiles, funnels, orgUnits, onSubmit, busy,
}: {
  profiles: any[]; funnels: any[]; orgUnits: any[]; onSubmit: (b: any) => void; busy: boolean;
}) {
  const [form, setForm] = useState({
    title: '',
    candidateProfileId: '',
    funnelId: '',
    orgUnitId: '',
    city: '',
    description: '',
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <Input required placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Select required value={form.candidateProfileId} onChange={(e) => setForm({ ...form, candidateProfileId: e.target.value })}>
        <option value="">Профиль</option>
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Select required value={form.funnelId} onChange={(e) => setForm({ ...form, funnelId: e.target.value })}>
        <option value="">Воронка</option>
        {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </Select>
      <Select value={form.orgUnitId} onChange={(e) => setForm({ ...form, orgUnitId: e.target.value })}>
        <option value="">Орг. единица</option>
        {orgUnits.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
      <Input placeholder="Город" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
      <Textarea placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <Button type="submit" disabled={busy || !form.candidateProfileId || !form.funnelId}>Создать</Button>
    </form>
  );
}
