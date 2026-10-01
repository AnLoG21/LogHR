'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell, Badge, Button, Card, Input, Select, StageStrip } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function VacancyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [citiesInput, setCitiesInput] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const { data: v } = useQuery({
    queryKey: ['vacancy', id],
    queryFn: () => api<any>(`/vacancies/${id}`),
  });

  const publish = useMutation({
    mutationFn: (board: string) =>
      api('/publications', { method: 'POST', body: JSON.stringify({ vacancyId: id, board }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacancy', id] }),
  });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/vacancies/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacancy', id] }),
  });
  const addCities = useMutation({
    mutationFn: (cities: string[]) =>
      api(`/vacancies/${id}/cities`, { method: 'POST', body: JSON.stringify({ cities }) }),
    onSuccess: () => {
      setCitiesInput('');
      qc.invalidateQueries({ queryKey: ['vacancy', id] });
      qc.invalidateQueries({ queryKey: ['vacancies'] });
    },
  });

  if (!v) return <AppShell title="Вакансия"><div className="text-[var(--muted)]">Загрузка…</div></AppShell>;

  const counters = new Map<string, number>(
    (v.stageCounters || []).map((s: any) => [String(s.stageId), Number(s._count) || 0]),
  );
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const applyUrl = `${origin}/public/apply/${id}`;
  const children: any[] = v.children || [];
  const isChild = Boolean(v.parent);
  const cityOptions = [v.city, ...children.map((c) => c.city)].filter(Boolean) as string[];
  const candidates = (v.candidates || []).filter(
    (c: any) => !cityFilter || (c.vacancy?.city || v.city) === cityFilter,
  );
  const parsedCities = citiesInput.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

  return (
    <AppShell
      title={isChild && v.city ? `${v.title} · ${v.city}` : v.title}
      subtitle={v.description || ''}
      actions={
        <>
          <Button variant="ghost" onClick={() => publish.mutate('HH')}>HH</Button>
          <Button variant="ghost" onClick={() => publish.mutate('AVITO')}>Avito</Button>
        </>
      }
    >
      {isChild ? (
        <Card className="p-4 mb-4 text-sm flex flex-wrap items-center justify-between gap-2">
          <div>
            Город мастер-вакансии{' '}
            <Link href={`/vacancies/${v.parent.id}`} className="underline text-[var(--brand-secondary)]">{v.parent.title}</Link>.
            Воронка и описание наследуются, кандидаты видны в общей воронке мастера.
          </div>
        </Card>
      ) : (
        <Card className="p-4 mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm">
              <div className="font-semibold">Города (мастер-вакансия)</div>
              <div className="text-xs text-[var(--muted)] mt-1">
                Одна воронка на все города. По каждому городу своя публикация и ссылка на отклик.
              </div>
            </div>
            <form
              className="flex gap-2 min-w-[280px] flex-1 max-w-md"
              onSubmit={(e) => { e.preventDefault(); if (parsedCities.length) addCities.mutate(parsedCities); }}
            >
              <Input
                placeholder="Казань, Самара, Уфа"
                value={citiesInput}
                onChange={(e) => setCitiesInput(e.target.value)}
              />
              <Button type="submit" disabled={!parsedCities.length || addCities.isPending}>Добавить</Button>
            </form>
          </div>
          {addCities.error ? (
            <div className="text-xs text-[var(--sk-danger)] mt-2">{(addCities.error as Error).message}</div>
          ) : null}
          {children.length ? (
            <div className="mt-3 divide-y divide-[var(--line)] border border-[var(--line)] rounded-lg">
              {children.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <Link href={`/vacancies/${c.id}`} className="font-medium hover:underline">{c.city}</Link>
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>Кандидаты: {c._count?.candidates ?? 0}</span>
                    <span>Публикации: {c._count?.publications ?? 0}</span>
                    {c.isPublicApply ? (
                      <button
                        type="button"
                        className="underline text-[var(--brand-secondary)]"
                        onClick={() => navigator.clipboard?.writeText(`${origin}/public/apply/${c.id}`)}
                      >
                        Скопировать ссылку отклика
                      </button>
                    ) : null}
                    <Badge color={c.isActive ? 'green' : 'slate'}>{c.isActive ? 'Активна' : 'Архив'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      )}

      <Card className="p-4 mb-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="text-sm">
          <div className="font-semibold">Публичный отклик</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {v.isPublicApply ? (
              <>Ссылка: <a className="underline text-[var(--brand-secondary)]" href={applyUrl} target="_blank" rel="noreferrer">{applyUrl}</a></>
            ) : (
              'Выключен — включите, чтобы принимать отклики без логина'
            )}
          </div>
        </div>
        <Button
          variant={v.isPublicApply ? 'ghost' : undefined}
          onClick={() => patch.mutate({ isPublicApply: !v.isPublicApply })}
          disabled={patch.isPending}
        >
          {v.isPublicApply ? 'Выключить форму' : 'Включить форму отклика'}
        </Button>
      </Card>
      <div className="mb-4">
        <StageStrip stages={v.funnel?.stages || []} counts={counters} />
      </div>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between gap-3">
          <span className="font-semibold text-[var(--brand-primary)]">Кандидаты</span>
          {cityOptions.length > 1 ? (
            <div className="w-48">
              <Select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                <option value="">Все города</option>
                {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          ) : null}
        </div>
        <div className="divide-y divide-[var(--line)]">
          {candidates.map((c: any) => (
            <Link key={c.id} href={`/candidates/${c.id}`} className="flex justify-between gap-2 px-4 py-3 hover:bg-[#f7fbfc] text-sm">
              <span className="font-medium">{fullName(c)}</span>
              <span className="flex items-center gap-2">
                {children.length ? <span className="text-xs text-[var(--muted)]">{c.vacancy?.city || v.city || '—'}</span> : null}
                <Badge color="blue">{c.stage?.name || '—'}</Badge>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
