'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AppShell, Button, Card, Empty, Input } from '@/components/ui';
import { api, fullName } from '@/lib/api';

type Tab = 'max' | 'whatsapp' | 'telegram';

type DialogItem = {
  candidateId: string;
  name: string;
  phone: string | null;
  linked: boolean;
  unread: number;
  invite: string | null;
  lastMessage: { id: string; text: string; fromBot: boolean; at: string } | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function formatMsgTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function MessengersPage() {
  return (
    <Suspense fallback={<AppShell title="Мессенджеры"><div className="text-[var(--sk-muted)]">Загрузка…</div></AppShell>}>
      <MessengersInner />
    </Suspense>
  );
}

function MessengersInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const initialTab = (sp.get('tab') as Tab) || 'max';
  const [tab, setTab] = useState<Tab>(['max', 'whatsapp', 'telegram'].includes(initialTab) ? initialTab : 'max');
  const [selectedId, setSelectedId] = useState<string | null>(sp.get('chat'));
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [mobileChat, setMobileChat] = useState(!!sp.get('chat'));
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const dialogs = useQuery({
    queryKey: ['max-dialogs'],
    queryFn: () => api<{ configured: boolean; botUsername: string | null; items: DialogItem[] }>('/integrations/max/dialogs'),
    refetchInterval: 8_000,
  });
  const candidates = useQuery({
    queryKey: ['candidates-msg'],
    queryFn: () => api<any>('/candidates?pageSize=50'),
    enabled: tab !== 'max',
  });
  const maxStatus = useQuery({
    queryKey: ['max-status'],
    queryFn: () => api<any>('/integrations/max/status'),
  });
  const chat = useQuery({
    queryKey: ['max-chat', selectedId],
    queryFn: () => api<any>(`/integrations/max-chat/${selectedId}`),
    enabled: !!selectedId && tab === 'max',
    refetchInterval: 5_000,
  });

  const send = useMutation({
    mutationFn: () =>
      api(`/integrations/max-chat/${selectedId}`, { method: 'POST', body: JSON.stringify({ text }) }),
    onSuccess: (res: any) => {
      if (res?.ok) {
        setText('');
        qc.invalidateQueries({ queryKey: ['max-chat', selectedId] });
        qc.invalidateQueries({ queryKey: ['max-dialogs'] });
        qc.invalidateQueries({ queryKey: ['max-inbox'] });
      }
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = dialogs.data?.items || [];
    if (!q) return items;
    return items.filter((d) => d.name.toLowerCase().includes(q) || (d.phone || '').includes(q));
  }, [dialogs.data?.items, search]);

  const selected = filtered.find((d) => d.candidateId === selectedId) || (dialogs.data?.items || []).find((d) => d.candidateId === selectedId);

  useEffect(() => {
    const chatParam = sp.get('chat');
    if (chatParam) {
      setSelectedId(chatParam);
      setTab('max');
      setMobileChat(true);
    }
  }, [sp]);

  useEffect(() => {
    if (chat.data?.messages) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat.data?.messages?.length, selectedId]);

  useEffect(() => {
    if (selectedId && chat.isSuccess) {
      qc.invalidateQueries({ queryKey: ['max-inbox'] });
      qc.invalidateQueries({ queryKey: ['max-dialogs'] });
    }
  }, [selectedId, chat.isSuccess, chat.dataUpdatedAt, qc]);

  const openChat = (id: string) => {
    setSelectedId(id);
    setMobileChat(true);
    router.replace(`/messengers?chat=${id}`, { scroll: false });
  };

  const setTabAndUrl = (t: Tab) => {
    setTab(t);
    if (t === 'max' && selectedId) router.replace(`/messengers?chat=${selectedId}`, { scroll: false });
    else router.replace(`/messengers?tab=${t}`, { scroll: false });
  };

  const phoneCandidates = (candidates.data?.items || []).filter((c: any) => c.phone);

  return (
    <AppShell
      title="Мессенджеры"
      subtitle="Чаты с кандидатами"
      flush={tab === 'max'}
      actions={
        tab === 'max' && maxStatus.data?.botUsername ? (
          <span className="text-sm text-[var(--sk-muted)]">Бот @{maxStatus.data.botUsername}</span>
        ) : null
      }
    >
      <div className={clsx('msg-tabs', tab === 'max' && 'msg-tabs-flush')}>
        {(
          [
            { id: 'max' as const, label: 'MAX' },
            { id: 'whatsapp' as const, label: 'WhatsApp' },
            { id: 'telegram' as const, label: 'Telegram' },
          ] as const
        ).map((t) => (
          <button key={t.id} type="button" className={clsx('sk-tab', tab === t.id && 'active')} onClick={() => setTabAndUrl(t.id)}>
            {t.label}
            {t.id === 'max' && (dialogs.data?.items || []).some((d) => d.unread > 0) ? (
              <span className="nav-badge" style={{ marginLeft: 8 }}>
                {(dialogs.data?.items || []).reduce((s, d) => s + (d.unread || 0), 0)}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'max' ? (
        <div className={clsx('tg-shell', mobileChat && selectedId && 'tg-shell-chat')}>
          <aside className="tg-sidebar">
            <div className="tg-sidebar-head">
              <div className="tg-sidebar-title">Чаты MAX</div>
              <Input
                placeholder="Поиск"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ height: 36, fontSize: 13 }}
              />
            </div>
            <div className="tg-list">
              {dialogs.isLoading ? <div className="tg-empty">Загрузка…</div> : null}
              {!dialogs.isLoading && !filtered.length ? (
                <div className="tg-empty">
                  {dialogs.data?.configured
                    ? 'Пока нет чатов. Отправьте кандидату ссылку-приглашение из его карточки.'
                    : 'Бот MAX не настроен.'}
                </div>
              ) : null}
              {filtered.map((d) => (
                <button
                  key={d.candidateId}
                  type="button"
                  className={clsx('tg-dialog', selectedId === d.candidateId && 'active')}
                  onClick={() => openChat(d.candidateId)}
                >
                  <div className="tg-avatar" data-tone={d.candidateId.charCodeAt(0) % 5}>
                    {initials(d.name)}
                  </div>
                  <div className="tg-dialog-body">
                    <div className="tg-dialog-row">
                      <span className="tg-dialog-name">{d.name}</span>
                      <span className="tg-dialog-time">{formatTime(d.lastMessage?.at)}</span>
                    </div>
                    <div className="tg-dialog-row">
                      <span className="tg-dialog-preview">
                        {d.lastMessage
                          ? `${d.lastMessage.fromBot ? 'Вы: ' : ''}${d.lastMessage.text}`
                          : d.linked
                            ? 'Чат связан'
                            : 'Ожидает открытия ссылки'}
                      </span>
                      {d.unread > 0 ? <span className="tg-unread">{d.unread > 99 ? '99+' : d.unread}</span> : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="tg-chat">
            {!selectedId ? (
              <div className="tg-chat-placeholder">
                <div className="tg-chat-placeholder-card">
                  <div className="tg-chat-placeholder-title">Выберите чат</div>
                  <div className="tg-chat-placeholder-text">Слева список кандидатов, которые писали в MAX. Нажмите, чтобы открыть переписку.</div>
                </div>
              </div>
            ) : (
              <>
                <header className="tg-chat-head">
                  <button type="button" className="tg-back" onClick={() => setMobileChat(false)} aria-label="К списку">
                    ←
                  </button>
                  <div className="tg-avatar tg-avatar-sm" data-tone={(selectedId || 'a').charCodeAt(0) % 5}>
                    {initials(selected?.name || '?')}
                  </div>
                  <div className="tg-chat-head-info">
                    <div className="tg-chat-head-name">{selected?.name || 'Кандидат'}</div>
                    <div className="tg-chat-head-sub">
                      {selected?.linked ? 'онлайн в MAX' : 'ещё не открыл ссылку'}
                      {selected?.phone ? ` · ${selected.phone}` : ''}
                    </div>
                  </div>
                  <a className="sk-btn sk-btn-outline tg-card-link" href={`/candidates/${selectedId}`}>
                    Карточка
                  </a>
                </header>

                <div className="tg-messages">
                  {chat.isLoading ? <div className="tg-empty">Загрузка переписки…</div> : null}
                  {(chat.data?.messages || [])
                    .slice()
                    .reverse()
                    .map((m: any) => (
                      <div key={m.id} className={clsx('tg-bubble-row', m.fromBot ? 'out' : 'in')}>
                        <div className={clsx('tg-bubble', m.fromBot ? 'out' : 'in')}>
                          <div className="tg-bubble-text">{m.text}</div>
                          <div className="tg-bubble-meta">{formatMsgTime(m.at)}</div>
                        </div>
                      </div>
                    ))}
                  {!chat.isLoading && !(chat.data?.messages || []).length ? (
                    <div className="tg-empty">Сообщений пока нет</div>
                  ) : null}
                  {!chat.data?.linked && chat.data?.invite ? (
                    <div className="tg-invite-hint">
                      Кандидат ещё не открыл бота. Скопируйте ссылку и отправьте ему:
                      <div className="tg-invite-actions">
                        <Button
                          variant="ghost"
                          onClick={() => navigator.clipboard?.writeText(chat.data.invite)}
                        >
                          Скопировать ссылку
                        </Button>
                        <a className="sk-btn sk-btn-outline" href={chat.data.invite} target="_blank" rel="noreferrer">
                          Открыть
                        </a>
                      </div>
                    </div>
                  ) : null}
                  <div ref={bottomRef} />
                </div>

                <form
                  className="tg-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!text.trim() || send.isPending || !chat.data?.linked) return;
                    send.mutate();
                  }}
                >
                  <input
                    className="tg-composer-input"
                    placeholder={chat.data?.linked ? 'Написать сообщение…' : 'Сначала дождитесь, пока кандидат откроет ссылку'}
                    value={text}
                    disabled={!chat.data?.linked}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="tg-send"
                    disabled={!text.trim() || send.isPending || !chat.data?.linked}
                    aria-label="Отправить"
                  >
                    ➤
                  </button>
                </form>
                {send.data && !(send.data as any).ok ? (
                  <div className="tg-send-error">{(send.data as any).note}</div>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'whatsapp' || tab === 'telegram' ? (
        <div className="space-y-3" style={{ paddingBottom: 24 }}>
          <Card className="p-4 text-sm text-[var(--sk-muted)]">
            {tab === 'whatsapp'
              ? 'WhatsApp открывается в вашем личном аккаунте по номеру кандидата. Переписка в платформу не подтягивается.'
              : 'Telegram открывается в вашем личном аккаунте по номеру кандидата. Переписка в платформу не подтягивается.'}
          </Card>
          <div className="space-y-2">
            {phoneCandidates.map((c: any) => {
              const phone = String(c.phone).replace(/\D/g, '');
              const href = tab === 'whatsapp' ? `https://wa.me/${phone}` : `https://t.me/+${phone}`;
              return (
                <Card key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <a href={`/candidates/${c.id}`} className="font-semibold sk-link">{fullName(c)}</a>
                    <div className="text-xs text-[var(--sk-muted)]">{c.phone}</div>
                  </div>
                  <a className="sk-btn sk-btn-outline" href={href} target="_blank" rel="noreferrer">
                    Открыть {tab === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                  </a>
                </Card>
              );
            })}
            {!candidates.isLoading && !phoneCandidates.length ? <Empty text="Нет кандидатов с телефоном" /> : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
