'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, Input, Textarea } from '@/components/ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function publicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function PublicApplyPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useQuery({
    queryKey: ['public-vacancy', id],
    queryFn: () => publicApi<any>(`/vacancies/public/${id}`),
  });
  const pdn = useQuery({ queryKey: ['public-pdn'], queryFn: () => publicApi<any>('/pdn/public') });
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    middleName: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    about: '',
    pdnConsent: false,
  });
  const apply = useMutation({
    mutationFn: () => publicApi(`/vacancies/public/${id}/apply`, { method: 'POST', body: JSON.stringify(form) }),
  });

  const brand = data?.branding?.companyName || 'LogHR';
  const color = data?.branding?.primaryColor || '#0f2744';

  return (
    <div className="min-h-screen" style={{ background: '#f5f7f9' }}>
      <div style={{ background: color, color: '#fff', padding: '40px 24px' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>{brand}</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>Отклик на вакансию</h1>
        {data ? <p style={{ marginTop: 8, opacity: 0.9 }}>{data.title}{data.city ? ` · ${data.city}` : ''}</p> : null}
      </div>
      <div className="max-w-xl mx-auto px-4 py-8">
        {error ? <p className="text-[var(--danger)]">Вакансия недоступна для публичного отклика</p> : null}
        {data && apply.isSuccess ? (
          <Card className="p-6">
            <div className="text-lg font-bold text-[var(--success)]">Спасибо! Отклик принят.</div>
            <p className="text-sm text-[var(--muted)] mt-2">Рекрутер свяжется с вами по указанным контактам.</p>
          </Card>
        ) : null}
        {data && !apply.isSuccess ? (
          <Card className="p-6 space-y-3">
            {data.description ? <p className="text-sm text-[var(--muted)] whitespace-pre-wrap mb-2">{data.description}</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Фамилия *" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              <Input placeholder="Имя *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <Input placeholder="Отчество" value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
            <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="Город" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input placeholder="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Textarea placeholder="О себе / опыт" value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.pdnConsent} onChange={(e) => setForm({ ...form, pdnConsent: e.target.checked })} />
              <span>Согласен(на) на обработку персональных данных</span>
            </label>
            {[pdn.data?.consent, pdn.data?.policy].filter(Boolean).map((d: any) => (
              <details key={d.id} className="text-xs text-[var(--muted)]">
                <summary className="cursor-pointer">{d.title}</summary>
                <div className="mt-1 whitespace-pre-wrap">{d.content}</div>
              </details>
            ))}
            {apply.isError ? <div className="text-sm text-rose-600">{(apply.error as Error)?.message}</div> : null}
            <Button
              disabled={!form.firstName || !form.lastName || !form.pdnConsent || apply.isPending}
              onClick={() => apply.mutate()}
            >
              Отправить отклик
            </Button>
          </Card>
        ) : null}
        {!data && !error ? <p className="text-center text-[var(--muted)]">Загрузка…</p> : null}
      </div>
    </div>
  );
}
