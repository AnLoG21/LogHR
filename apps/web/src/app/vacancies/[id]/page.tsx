'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell, Badge, Button, Card, ErrorText, Field, Icon, Input, Modal, Select, StageStrip, Textarea } from '@/components/ui';
import { api, fullName } from '@/lib/api';

export default function VacancyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [citiesInput, setCitiesInput] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ title: '', description: '', city: '', funnelId: '', orgUnitId: '', candidateProfileId: '' });
  const { data: v } = useQuery({
    queryKey: ['vacancy', id],
    queryFn: () => api<any>(`/vacancies/${id}`),
  });
  const funnels = useQuery({ queryKey: ['funnels'], queryFn: () => api<any[]>('/funnels'), enabled: editOpen });
  const profiles = useQuery({ queryKey: ['profiles-mini'], queryFn: () => api<any>('/profiles?pageSize=200'), enabled: editOpen });
  const orgUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=200'), enabled: editOpen });

  const publish = useMutation({
    mutationFn: (board: string) =>
      api('/publications', { method: 'POST', body: JSON.stringify({ vacancyId: id, board }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacancy', id] }),
  });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/vacancies/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['vacancy', id] });
      qc.invalidateQueries({ queryKey: ['vacancies'] });
    },
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

  if (!v) return <AppShell title="Вакансия"><div className="text-[var(--sk-muted)]">Загрузка…</div></AppShell>;

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
          <Link href="/vacancies" className="sk-btn sk-btn-outline">← Все вакансии</Link>
          <Button
            variant="ghost"
            onClick={() => {
              setEdit({
                title: v.title || '',
                description: v.description || '',
                city: v.city || '',
                funnelId: v.funnelId || v.funnel?.id || '',
                orgUnitId: v.orgUnitId || v.orgUnit?.id || '',
                candidateProfileId: v.candidateProfileId || v.candidateProfile?.id || '',
              });
              setEditOpen(true);
            }}
          >
            <Icon name="edit" className="w-4 h-4" /> Изменить
          </Button>
          <Button variant="ghost" onClick={() => patch.mutate({ isActive: !v.isActive })} disabled={patch.isPending}>
            {v.isActive ? 'В архив' : 'Вернуть из архива'}
          </Button>
          <Button variant="ghost" onClick={() => publish.mutate('HH')} disabled={!v.isActive}>Опубликовать на HeadHunter</Button>
          <Button variant="ghost" onClick={() => publish.mutate('AVITO')} disabled={!v.isActive}>Опубликовать на Avito</Button>
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
                    <button
                      type="button"
                      className="sk-link text-xs"
                      onClick={() => api(`/vacancies/${c.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !c.isActive }) }).then(() => {
                        qc.invalidateQueries({ queryKey: ['vacancy', id] });
                        qc.invalidateQueries({ queryKey: ['vacancies'] });
                      })}
                    >
                      {c.isActive ? 'В архив' : 'Вернуть'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      )}

      <Card className="p-4 mb-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <span><span className="text-[var(--sk-muted)]">Профиль:</span> {v.candidateProfile?.name || '—'}</span>
          <span><span className="text-[var(--sk-muted)]">Воронка:</span> {v.funnel?.name || '—'}</span>
          <span><span className="text-[var(--sk-muted)]">Подразделение:</span> {v.orgUnit?.name || '—'}</span>
          <span><span className="text-[var(--sk-muted)]">Город:</span> {v.city || '—'}</span>
          <Badge color={v.isActive ? 'green' : 'slate'}>{v.isActive ? 'Активна' : 'В архиве'}</Badge>
        </div>
        {v.description ? <div className="mt-3 whitespace-pre-wrap text-[13px]">{v.description}</div> : null}
      </Card>

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
            <Link key={c.id} href={`/candidates/${c.id}`} className="flex justify-between gap-2 px-4 py-3 hover:bg-[var(--sk-hover)] text-sm">
              <span className="font-medium">{fullName(c)}</span>
              <span className="flex items-center gap-2">
                {children.length ? <span className="text-xs text-[var(--muted)]">{c.vacancy?.city || v.city || '—'}</span> : null}
                <Badge color="blue">{c.stage?.name || '—'}</Badge>
              </span>
            </Link>
          ))}
        </div>
      </Card>

      <Modal open={editOpen} title="Изменить вакансию" onClose={() => setEditOpen(false)} maxWidth={560}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            patch.mutate({
              title: edit.title,
              description: edit.description || '',
              city: edit.city || '',
              funnelId: edit.funnelId || undefined,
              orgUnitId: edit.orgUnitId || undefined,
              candidateProfileId: edit.candidateProfileId || undefined,
            });
          }}
        >
          <Field label="Название"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required /></Field>
          <Field label="Описание"><Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Профиль кандидата">
              <Select value={edit.candidateProfileId} onChange={(e) => setEdit({ ...edit, candidateProfileId: e.target.value })} required>
                {(profiles.data?.items || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Воронка">
              <Select value={edit.funnelId} onChange={(e) => setEdit({ ...edit, funnelId: e.target.value })} required>
                {(funnels.data || []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
            <Field label="Подразделение">
              <Select value={edit.orgUnitId} onChange={(e) => setEdit({ ...edit, orgUnitId: e.target.value })}>
                {!edit.orgUnitId ? <option value="">Не указано</option> : null}
                {(orgUnits.data?.items || []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="Город"><Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
          </div>
          <ErrorText error={patch.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>Отмена</Button>
            <Button type="submit" disabled={patch.isPending}>Сохранить</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
