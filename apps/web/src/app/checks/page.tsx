'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, Empty, Field, Modal, Select } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import { CHECK_STATUS_LABELS, CHECK_TYPE_LABELS, ruLabel } from '@skillaz/shared';

const TYPES = ['SECURITY', 'HIRING', 'FEEDBACK'] as const;

export default function ChecksPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [type, setType] = useState<string>('SECURITY');
  const { data, isLoading } = useQuery({
    queryKey: ['checks'],
    queryFn: () => api<any>('/checks?pageSize=50'),
  });
  const candidates = useQuery({
    queryKey: ['candidates-mini-checks'],
    queryFn: () => api<any>('/candidates?pageSize=100&view=short'),
    enabled: createOpen,
  });
  const change = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/checks/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checks'] }),
  });
  const create = useMutation({
    mutationFn: () => api('/checks', { method: 'POST', body: JSON.stringify({ candidateId, type }) }),
    onSuccess: () => {
      setCreateOpen(false);
      setCandidateId('');
      qc.invalidateQueries({ queryKey: ['checks'] });
    },
  });

  return (
    <AppShell
      title="Проверки"
      subtitle="СБ, заявка на приём, обратная связь"
      actions={<Button onClick={() => setCreateOpen(true)}>Новая проверка</Button>}
    >
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--sk-soft)] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Тип</th>
              <th className="px-4 py-3 font-semibold">Кандидат</th>
              <th className="px-4 py-3 font-semibold">Статус</th>
              <th className="px-4 py-3 font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {(data?.items || []).map((c: any) => {
              const open = c.status === 'NEW' || c.status === 'IN_PROGRESS';
              return (
                <tr key={c.id} className="hover:bg-[var(--sk-hover)]">
                  <td className="px-4 py-3">{ruLabel(CHECK_TYPE_LABELS, c.type)}</td>
                  <td className="px-4 py-3">
                    {c.candidate?.id ? (
                      <Link className="sk-link" href={`/candidates/${c.candidate.id}?tab=checks`}>
                        {fullName(c.candidate)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={c.status === 'APPROVED' ? 'green' : c.status === 'REJECTED' ? 'rose' : 'amber'}>
                      {ruLabel(CHECK_STATUS_LABELS, c.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {open ? (
                        <>
                          <Button variant="ghost" onClick={() => change.mutate({ id: c.id, status: 'APPROVED' })}>Одобрить</Button>
                          <Button variant="ghost" onClick={() => change.mutate({ id: c.id, status: 'REJECTED' })}>Отклонить</Button>
                          <Button variant="ghost" onClick={() => change.mutate({ id: c.id, status: 'CANCELLED' })}>Отменить</Button>
                        </>
                      ) : null}
                      {c.externalToken ? (
                        <a className="text-xs text-[var(--brand-secondary)] underline self-center" href={`/public/check/${c.externalToken}`} target="_blank" rel="noreferrer">
                          Ссылка
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && !data?.items?.length ? <Empty text="Проверок нет" /> : null}
      </Card>

      <Modal open={createOpen} title="Новая проверка" onClose={() => setCreateOpen(false)}>
        <div className="space-y-3">
          <Field label="Кандидат">
            <Select value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
              <option value="">Выберите</option>
              {(candidates.data?.items || []).map((cand: any) => (
                <option key={cand.id} value={cand.id}>{fullName(cand)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Тип">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{ruLabel(CHECK_TYPE_LABELS, t)}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button disabled={!candidateId || create.isPending} onClick={() => create.mutate()}>Создать</Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
