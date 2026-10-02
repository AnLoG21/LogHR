'use client';

import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ROLE_LABELS, SystemRole } from '@skillaz/shared';
import { AppShell, Badge, Card, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';

type Member = {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  phone?: string | null;
  orgUnit?: { id: string; name: string } | null;
  mangoExtension?: string | null;
  hh: { connected: boolean; manager?: any; employer?: any; connectedAt?: string | null };
  stats: { candidates: number; requests: number; openTasks: number };
};

function managerLabel(m?: any) {
  if (!m) return '';
  return [m.lastName, m.firstName].filter(Boolean).join(' ') || m.email || '';
}

export default function TeamPage() {
  const team = useQuery({ queryKey: ['team'], queryFn: () => api<Member[]>('/integrations/team') });
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [openId, setOpenId] = useState<string | null>(null);

  const list = (team.data || []).filter(
    (m) => !dq || m.name.toLowerCase().includes(dq) || m.email.toLowerCase().includes(dq),
  );
  const hhCount = (team.data || []).filter((m) => m.hh.connected).length;

  return (
    <AppShell title="Моя команда" subtitle="Сотрудники, их HeadHunter, телефония и нагрузка">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input placeholder="Поиск по имени или email" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        {team.data ? (
          <div className="text-sm text-[var(--sk-muted)]">
            Сотрудников: {team.data.length} · HeadHunter подключён у {hhCount}
          </div>
        ) : null}
      </div>

      <Card className="p-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--sk-panel)]">
            <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--line)]">
              <th className="py-2 px-3 font-medium">Сотрудник</th>
              <th className="py-2 px-3 font-medium">Роль</th>
              <th className="py-2 px-3 font-medium">HeadHunter</th>
              <th className="py-2 px-3 font-medium">Mango</th>
              <th className="py-2 px-3 font-medium text-right">Кандидаты</th>
              <th className="py-2 px-3 font-medium text-right">Заявки</th>
              <th className="py-2 px-3 font-medium text-right">Открытые задачи</th>
            </tr>
          </thead>
          <tbody>
            {team.isLoading ? (
              <tr><td colSpan={7} className="py-6 text-center text-[var(--sk-muted)]">Загрузка…</td></tr>
            ) : null}
            {list.map((m) => (
              <tr
                key={m.id}
                className="border-b border-[var(--line)] cursor-pointer hover:bg-[var(--sk-panel)]"
                onClick={() => setOpenId(m.id)}
              >
                <td className="py-2 px-3">
                  <div className="font-medium">{m.name || m.email}</div>
                  <div className="text-xs text-[var(--sk-muted)]">{m.email}{m.orgUnit?.name ? ` · ${m.orgUnit.name}` : ''}</div>
                </td>
                <td className="py-2 px-3">{ROLE_LABELS[m.role] || m.role}</td>
                <td className="py-2 px-3">
                  {m.hh.connected ? (
                    <div>
                      <Badge color="green">подключён</Badge>
                      {managerLabel(m.hh.manager) ? (
                        <div className="text-xs text-[var(--sk-muted)] mt-1">{managerLabel(m.hh.manager)}</div>
                      ) : null}
                    </div>
                  ) : (
                    <Badge color="amber">нет</Badge>
                  )}
                </td>
                <td className="py-2 px-3">{m.mangoExtension || <span className="text-[var(--sk-muted)]">—</span>}</td>
                <td className="py-2 px-3 text-right">{m.stats.candidates}</td>
                <td className="py-2 px-3 text-right">{m.stats.requests}</td>
                <td className="py-2 px-3 text-right">{m.stats.openTasks}</td>
              </tr>
            ))}
            {team.data && !list.length ? (
              <tr><td colSpan={7} className="py-6 text-center text-[var(--sk-muted)]">Никого не нашли</td></tr>
            ) : null}
          </tbody>
        </table>
      </Card>
      {team.isError ? <div className="text-sm text-[var(--sk-danger)] mt-3">{(team.error as Error).message}</div> : null}

      <MemberModal id={openId} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}

function MemberModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['team', id],
    queryFn: () => api<any>(`/integrations/team/${id}`),
    enabled: !!id,
  });
  const d = detail.data;
  return (
    <Modal open={!!id} title={d?.user?.name || 'Сотрудник'} onClose={onClose}>
      {detail.isLoading ? <div className="text-sm text-[var(--sk-muted)]">Загрузка…</div> : null}
      {d ? (
        <div className="space-y-4">
          <div className="text-sm space-y-1">
            <div>{ROLE_LABELS[d.user.role as SystemRole] || d.user.role} · {d.user.email}</div>
            {d.user.phone ? <div>Телефон: {d.user.phone}</div> : null}
            {d.user.orgUnit?.name ? <div>Подразделение: {d.user.orgUnit.name}</div> : null}
            <div>Mango: {d.user.mangoExtension ? `внутренний ${d.user.mangoExtension}` : 'номер не указан'}</div>
            <div>
              HeadHunter:{' '}
              {d.user.hh.connected
                ? `подключён${managerLabel(d.user.hh.manager) ? ` — ${managerLabel(d.user.hh.manager)}` : ''}${d.user.hh.employer?.name ? `, ${d.user.hh.employer.name}` : ''}`
                : 'не подключён'}
            </div>
          </div>
          <div>
            <div className="font-bold text-[var(--brand-primary)] mb-2">Кандидаты в работе ({d.candidates.length})</div>
            {d.candidates.length ? (
              <div className="max-h-80 overflow-auto space-y-1">
                {d.candidates.map((c: any) => (
                  <Link
                    key={c.id}
                    href={`/candidates/${c.id}`}
                    className="flex justify-between gap-3 text-sm border-b border-[var(--line)] py-1 hover:text-[var(--brand-secondary)]"
                  >
                    <span>{[c.lastName, c.firstName].filter(Boolean).join(' ') || 'Без имени'}</span>
                    <span className="text-xs text-[var(--sk-muted)] text-right">
                      {[c.vacancy?.title, c.stage?.name].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--sk-muted)]">Пока нет назначенных кандидатов</div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
