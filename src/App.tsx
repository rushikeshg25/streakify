import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Archive, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Flame, Gift, LayoutGrid, ListChecks, LoaderCircle, MoreHorizontal, MessageSquare, Search, Pause, Pencil, Pin, Play, Plus, RotateCcw, Settings2, Sparkles, Sprout, TrendingUp, X, Zap } from 'lucide-react';
import type { Command, Entry, Habit, HabitInput, Reward, State } from '../shared/model';
import { addDays, balances, entryFor, isDue, isPaused, ruleAt, streak, templates, todayIn, weekOf, weeklyCompletions } from '../shared/model';
import { Coin, dateLabel, Empty, Modal, scheduleLabel, Symbol } from './ui';
import { HabitForm, RewardForm } from './forms';
import { NoteForm } from './NoteForm';
import { DatePicker } from './DatePicker';
import { useShortcuts } from './useShortcuts';
import { ProgressScreen, RewardsScreen, SettingsScreen } from './screens';

export type RunCommand = (command: Command, message?: string) => Promise<boolean>;
type Page = 'today' | 'habits' | 'progress' | 'rewards' | 'settings';
const nav = [{ id: 'today', label: 'Today', icon: LayoutGrid }, { id: 'habits', label: 'My habits', icon: ListChecks }, { id: 'progress', label: 'Progress', icon: TrendingUp }, { id: 'rewards', label: 'Rewards', icon: Gift }, { id: 'settings', label: 'Settings', icon: Settings2 }] as const;
type Toast = { message: string; error?: boolean; undo?: () => void };

export default function App({ onSignOut }: { onSignOut?: () => Promise<void> }) {
  const [state, setState] = useState<State | null>(null);
  const [page, setPage] = useState<Page>(() => nav.some(n => n.id === location.hash.slice(1)) ? location.hash.slice(1) as Page : 'today');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [habitForm, setHabitForm] = useState<{ habit?: Habit; initial?: HabitInput } | null>(null);
  const [rewardForm, setRewardForm] = useState<{ reward?: Reward } | null>(null);
  const [logForm, setLogForm] = useState<{ habit: Habit; date: string } | null>(null);
  const [help, setHelp] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [filter, setFilter] = useState('All habits');
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [search, setSearch] = useState('');
  const [habitQuery, setHabitQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: () => Promise<boolean> } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((value: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(value);
    if (value.error) window.dispatchEvent(new CustomEvent('streakify:error', { detail: value.message }));
    if (!value.error) toastTimer.current = setTimeout(() => setToast(null), value.undo ? 10000 : 4500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/state');
      if (response.status === 401) { window.dispatchEvent(new Event('streakify:sign-in')); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your habits could not be loaded. Try again.');
      setState(result); setError('');
    } catch (err) { setError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'Could not connect to Streakify. Check your connection, then try again.'); }
  }, []);
  useEffect(() => { void refresh(); const interval = setInterval(() => setNow(new Date()), 30000); return () => { clearInterval(interval); if (toastTimer.current) clearTimeout(toastTimer.current); }; }, [refresh]);
  useEffect(() => { const change = () => { const key = location.hash.slice(1); if (nav.some(n => n.id === key)) setPage(key as Page); }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = state?.settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : state?.settings.theme ?? 'light'; };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [state?.settings.theme]);
  const run: RunCommand = async (command, message) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true);
    const body = JSON.stringify({ requestId: crypto.randomUUID(), command });
    try {
      let response: Response;
      try { response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); }
      catch { response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); }
      const result = await response.json();
      if (response.status === 401) window.dispatchEvent(new Event('streakify:sign-in'));
      if (!response.ok) throw new Error(result.error);
      setState(result); if (message) notify({ message }); return true;
    } catch (err) { notify({ message: err instanceof Error ? err.message : 'The change could not be saved. Try again.', error: true }); await refresh(); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };
  function navigate(next: Page) { setPage(next); location.hash = next; setFilter('All habits'); setStatusFilter('all'); setSearch(''); window.scrollTo({ top: 0 }); }
  const shortcuts = useShortcuts(!!state && !busy, key => {
    const next = nav[Number(key) - 1];
    if (/^[1-5]$/.test(key) && next) { navigate(next.id); return true; }
    if (key === 'n') { setHabitForm({}); return true; }
    if (key === '?') { setHelp(true); return true; }
    if (key === '/') {
      const input = document.querySelector<HTMLInputElement>('main input[aria-label^="Search"]');
      if (input) { input.focus(); return true; }
    }
    return false;
  });
  if (!state) return <div className="loading-screen"><span className="brand-mark"><Zap fill="currentColor" size={26} /></span><h1>Streakify</h1>{error ? <><p>{error}</p><button className="button primary" onClick={() => void refresh()}>Try again</button></> : <><LoaderCircle className="spin" size={24} /><p>Making room for better days…</p></>}</div>;

  const noteEntry = state.entries.find(entry => entry.id === noteId);
  const today = todayIn(state.settings.timezone, now);
  const date = selectedDate && selectedDate <= today ? selectedDate : today;
  const earliest = state.habits.reduce((first, habit) => habit.created < first ? habit.created : first, today);
  const balance = balances(state);
  const level = Math.floor(balance.xp / state.settings.levelSize) + 1;
  const levelProgress = balance.xp % state.settings.levelSize;
  const active = state.habits.filter(h => !h.archived).sort((a,b) => a.order - b.order);
  const due = active.filter(h => isDue(state, h, date)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const managedHabits = state.habits.filter(h => h.archived === showArchived && `${h.name} ${h.category}`.toLowerCase().includes(habitQuery.trim().toLowerCase())).sort((a, b) => a.order - b.order);
  const completed = due.filter(h => entryFor(state, h.id, date)?.complete).length;
  const rested = due.filter(h => entryFor(state, h.id, date)?.rested).length;
  const categories = [...new Set((page === 'today' ? due : active).map(h => h.category))];
  const activeFilter = categories.includes(filter) ? filter : 'All habits';
  const visibleHabits = due.filter(h => {
    const entry = entryFor(state, h.id, date);
    return (activeFilter === 'All habits' || h.category === activeFilter)
      && (statusFilter === 'all' || (statusFilter === 'done' ? entry?.complete : !entry?.complete && !entry?.rested))
      && `${h.name} ${h.category}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const dailyXp = state.entries.filter(e => e.date === date).reduce((sum, e) => sum + e.xp, 0);
  const bestStreak = Math.max(0, ...active.map(h => streak(state, h, today)));
  const week = weekOf(date, state.settings.weekStart);
  const weekCheckins = state.entries.filter(e => e.complete && e.date >= week && e.date < addDays(week, 7) && e.date <= today).length;
  const remaining = due.length - completed - rested;
  const dayPercent = due.length ? Math.round(completed / due.length * 100) : 0;

  async function log(habit: Habit, day: string, value: number, rest = false) {
    const current = state!;
    const old = entryFor(current, habit.id, day);
    const ok = await run({ type: 'entry.set', habitId: habit.id, date: day, value, rested: rest });
    if (ok) {
      const rule = old?.rule ?? ruleAt(habit, day);
      notify({ message: rest ? 'Rest day saved. Your streak is protected.' : value >= rule.target ? `${habit.name} completed. Nicely done!` : value === 0 ? 'Check-in undone.' : 'Progress saved. Keep it going.', undo: () => { void run({ type: 'entry.set', habitId: habit.id, date: day, value: old?.value ?? 0, rested: old?.rested ?? false }, 'Previous progress restored.'); setToast(null); } });
    }
    return ok;
  }
  function openLog(habit: Habit) { const rule = entryFor(state!, habit.id, date)?.rule ?? ruleAt(habit, date); if (rule.type === 'check') void log(habit, date, 1); else setLogForm({ habit, date }); }
  const habitRow = (habit: Habit, manage = false) => {
    const entry = entryFor(state, habit.id, date);
    const rule = entry?.rule ?? ruleAt(habit, date);
    const paused = isPaused(habit, today);
    const pending = habit.versions.find(v => v.effective > today);
    const currentStreak = streak(state, habit, manage ? today : date);
    const done = entry?.complete;
    return <article key={habit.id} className={`habit-row ${done && !manage ? 'is-complete' : ''}`}>
      <span className={`habit-icon ${habit.color}`}><Symbol name={habit.icon} size={23} /></span>
      <div className="habit-body"><div className="habit-title"><h3>{habit.name}</h3>{habit.pinned && <span className="pin-label" title="Pinned on Today"><Pin size={12} />Pinned</span>}{manage && paused && <span className="badge">Paused</span>}{habit.archived && <span className="badge">Archived</span>}</div><div className="habit-meta"><span>{habit.category}</span><i />{manage ? <span>{scheduleLabel(rule)}</span> : <span>{rule.type === 'check' ? rule.schedule === 'weekly' ? `${weeklyCompletions(state, habit.id, date)} / ${rule.weeklyTarget} this week` : 'One small step' : `${entry?.value ?? 0} / ${rule.target} ${rule.unit}`}</span>}</div>{!manage && rule.type !== 'check' && <div className="habit-progress"><div style={{ width: `${Math.min(100, (entry?.value ?? 0) / rule.target * 100)}%` }} /></div>}{!manage && entry?.note && <button className="entry-note-preview" onClick={() => setNoteId(entry.id)} aria-label={`Edit note for ${habit.name}`}><MessageSquare size={12} /><span>{entry.note}</span></button>}{manage && pending && <small className="pending-note">Rule changes start {dateLabel(pending.effective)}</small>}</div>
      {!manage && state.settings.showStreaks && currentStreak > 0 && <span className="streak-badge" title={rule.schedule === 'weekly' ? 'Consecutive successful weeks' : 'Consecutive scheduled days'}><Flame size={15} />{currentStreak}{rule.schedule === 'weekly' ? 'w' : 'd'}</span>}
      {!manage && <div className="habit-earnings">{state.settings.showXp && <span>+{entry?.complete ? entry.xp : rule.xp ?? state.settings.defaultXp} XP</span>}{state.settings.showCoins && <small><Coin size={13} />{entry?.complete ? entry.coins : rule.coins ?? state.settings.defaultCoins}</small>}</div>}
      {manage ? <div className="manage-actions"><button className="icon-button" aria-label={`${habit.pinned ? 'Unpin' : 'Pin'} ${habit.name}`} aria-pressed={!!habit.pinned} disabled={busy || habit.archived} onClick={() => void run({ type: 'habit.pin', habitId: habit.id, pinned: !habit.pinned }, habit.pinned ? 'Habit unpinned.' : 'Pinned to the top of Today.')}><Pin size={17} /></button><button className="icon-button" title="Move up" aria-label={`Move ${habit.name} up`} disabled={busy || habit.archived} onClick={() => void run({ type: 'habit.move', habitId: habit.id, direction: 'up' })}><ArrowUp size={16} /></button><button className="icon-button" title="Move down" aria-label={`Move ${habit.name} down`} disabled={busy || habit.archived} onClick={() => void run({ type: 'habit.move', habitId: habit.id, direction: 'down' })}><ArrowDown size={16} /></button><button className="icon-button" aria-label={`Edit ${habit.name}`} onClick={() => setHabitForm({ habit })}><Pencil size={17} /></button><button className="icon-button" aria-label={`${paused ? 'Resume' : 'Pause'} ${habit.name}`} disabled={busy || habit.archived} onClick={() => void run({ type: 'habit.pause', habitId: habit.id, paused: !paused }, paused ? 'Habit resumed.' : 'Habit paused. Your history is safe.')} >{paused ? <Play size={17} /> : <Pause size={17} />}</button><button className="icon-button" aria-label={`${habit.archived ? 'Restore' : 'Archive'} ${habit.name}`} disabled={busy} onClick={() => habit.archived ? void run({ type: 'habit.archive', habitId: habit.id, archived: false }, 'Habit restored.') : setConfirm({ title: 'Archive this habit?', text: `“${habit.name}” will leave your daily list. Your history and earnings stay, and you can restore it anytime.`, action: () => run({ type: 'habit.archive', habitId: habit.id, archived: true }, 'Habit archived.') })}>{habit.archived ? <RotateCcw size={17} /> : <Archive size={17} />}</button></div>
        : <>{done ? <button className="complete-button" aria-label={`Undo ${habit.name}`} disabled={busy} onClick={() => void log(habit, date, 0)}><Check size={19} /><span>Done</span></button> : entry?.rested ? <button className="rest-button" disabled={busy} onClick={() => void log(habit, date, 0)}>Rest day <RotateCcw size={14} /></button> : <button className="log-button" aria-label={`Log ${habit.name}`} disabled={busy} onClick={() => openLog(habit)}><Plus size={19} /><span>{rule.type === 'check' ? 'Check in' : 'Log progress'}</span></button>}
        <details className="row-menu"><summary aria-label={`More options for ${habit.name}`}><MoreHorizontal size={20} /></summary><div>{entry && <button onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); setNoteId(entry.id); }}><MessageSquare size={15} />{entry.note ? 'Edit note' : 'Add note'}</button>}<button onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); setHabitForm({ habit }); }}><Pencil size={15} />Edit habit</button><button disabled={busy} onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); void log(habit, date, 0, !entry?.rested); }}><LeafIcon />{entry?.rested ? 'Remove rest day' : 'Take a rest day'}</button></div></details></>}
    </article>;
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar"><a className="brand" href="#today" onClick={() => navigate('today')}><span className="brand-mark"><Zap size={23} fill="currentColor" /></span>streakify<span className="brand-dot">.</span></a>
      <nav aria-label="Main navigation">{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={20} /><span>{item.label}</span>{item.id === 'today' && due.length > 0 && <small>{completed}/{due.length}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Sprout size={25} /><strong>Small steps. Real growth.</strong><p>Your pace is the right pace.<br />Just keep showing up.</p></div><button className="help-button" onClick={() => setHelp(true)}><CircleHelp size={18} />A quick guide</button><button className="profile" onClick={() => navigate('settings')}><span className="avatar">{state.settings.name.slice(0, 1).toUpperCase()}</span><span><strong>{state.settings.name}</strong><small>Your personal space</small></span><Settings2 size={17} /></button></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">Personal workspace <ChevronRight size={13} /><span>{nav.find(n => n.id === page)?.label}</span></div><div className="topbar-right"><button className="icon-button guide-trigger" aria-label="Open guide and keyboard shortcuts" title="Guide and shortcuts (?)" onClick={() => setHelp(true)}><CircleHelp size={18} /></button>{onSignOut && <button className="logout-button" onClick={() => void onSignOut()}>Sign out</button>}{state.settings.showCoins && <span className="coin-balance" title="Available coins"><Coin size={18} />{balance.coins}<span>coins</span></span>}<span className="top-avatar">{state.settings.name.slice(0, 1).toUpperCase()}</span></div></header>
      <main id="main-content" tabIndex={-1}>
        {error && <div className="error-banner" role="alert">{error}<button onClick={() => void refresh()}>Retry</button></div>}
        {page === 'today' && <>
          <div className="page-heading"><div><p className="date-heading"><SunIcon />{dateLabel(date, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>{date === today ? 'Make today count.' : 'Every step is part of the story.'}</h1><p>{state.settings.name === 'Friend' ? 'Your space to build a little more consistency.' : `Welcome back, ${state.settings.name}. Let’s take one small step.`}</p></div><button className="button primary" onClick={() => setHabitForm({})}><Plus size={18} />New habit</button></div>
          {!state.habits.length && <div className="setup-banner"><span><strong>Make this space yours.</strong> Your check-ins follow {state.settings.timezone.replaceAll('_', ' ')}.</span><button className="text-button" onClick={() => navigate('settings')}>Personalize workspace <ArrowUpRight size={16} /></button></div>}
          <div className="today-layout"><div className="today-main">
            <section className="day-card" aria-label="Daily progress">
              <div className="daily-copy"><span className="section-eyebrow"><span className="live-dot" /> YOUR DAILY MOMENTUM</span>
                <h2>{completed === due.length && due.length > 0 ? 'You showed up. It adds up.' : completed ? 'Keep that good thing going.' : 'Small steps. A stronger you.'}</h2>
                <p>{due.length ? <><strong>{completed} of {due.length}</strong> habits completed{rested > 0 ? ` · ${rested} resting` : ''}</> : 'Big changes begin with a little daily practice.'}</p>
                <div className="daily-progress" role="progressbar" aria-label="Habits completed" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={due.length || 1}><div style={{ width: `${dayPercent}%` }} /></div>
                <span className="momentum-caption">{!due.length ? 'Make room for your first small win.' : remaining ? `${remaining} small ${remaining === 1 ? 'step' : 'steps'} still ahead. You’ve got this.` : rested ? 'A little effort. A little room to rest.' : 'Take a breath. Enjoy your progress.'}</span>
              </div>
              <div className="completion-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle className="ring-track" cx="60" cy="60" r="52" /><circle className="ring-value" cx="60" cy="60" r="52" strokeDasharray={`${dayPercent / 100 * 327} 327`} /></svg><div><strong>{dayPercent}<span>%</span></strong><small>COMPLETE</small></div></div>
            </section>
            <div className="daily-overview" aria-label="Daily overview"><div><span className="overview-icon"><ListChecks size={18} /></span><span><strong>{remaining}</strong><small>Still to do</small></span></div><div><span className="overview-icon"><Check size={18} /></span><span><strong>{completed}</strong><small>Completed</small></span></div><div><span className="overview-icon"><TrendingUp size={18} /></span><span><strong>{weekCheckins}</strong><small>This week</small></span></div></div>
            <section className="habits-section"><div className="section-heading"><h2>Your habits <span className="count-badge">{due.length}</span></h2><div className="date-nav"><button className="icon-button" aria-label="Jump to a day" onClick={() => setDatePickerOpen(true)}><CalendarDays size={17} /></button><button className="icon-button" aria-label="Previous day" disabled={date <= earliest} onClick={() => setSelectedDate(addDays(date, -1))}><ChevronLeft size={17} /></button><button className="text-button" onClick={() => setSelectedDate(null)}>{date === today ? 'Today' : dateLabel(date)}</button><button className="icon-button" aria-label="Next day" disabled={date >= today} onClick={() => setSelectedDate(addDays(date, 1))}><ChevronRight size={17} /></button></div></div>
              <div className="week-strip">{Array.from({ length: 7 }, (_, i) => addDays(week, i)).map(day => { const count = state.entries.filter(e => e.date === day && e.complete).length; return <button key={day} disabled={day > today} aria-pressed={day === date} className={day === date ? 'selected' : ''} onClick={() => setSelectedDate(day)}><span>{dateLabel(day, { weekday: 'short' })}</span><strong>{dateLabel(day, { day: 'numeric' })}</strong><i className={count ? 'has-progress' : ''}>{count ? <Check size={9} /> : null}</i></button>; })}</div>
              {due.length > 0 && <><div className="habit-toolbar"><div className="status-tabs" aria-label="Filter by completion">{([{ id: 'all', label: 'All' }, { id: 'todo', label: 'To do' }, { id: 'done', label: 'Done' }] as const).map(item => <button key={item.id} aria-pressed={statusFilter === item.id} onClick={() => setStatusFilter(item.id)}>{item.label}</button>)}</div><label className="habit-search"><Search size={16} /><input aria-label="Search habits" placeholder="Find a habit…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
                {categories.length > 1 && <div className="filter-tabs" aria-label="Filter habits">{['All habits', ...categories].map(c => <button key={c} aria-pressed={activeFilter === c} className={activeFilter === c ? 'active' : ''} onClick={() => setFilter(c)}>{c}</button>)}</div>}</>}
              <div className="habit-list">{visibleHabits.map(h => habitRow(h))}</div>
              {!active.length ? <div className="start-habits"><div className="section-heading"><div><h3>Your next chapter starts here.</h3><p>Pick a starting point, or create something all your own.</p></div></div><div className="starter-grid">{templates.map(t => <button className="starter-card" key={t.name} onClick={() => setHabitForm({ initial: structuredClone(t) })}><span className={`habit-icon ${t.color}`}><Symbol name={t.icon} size={22} /></span><strong>{t.name}</strong><small>{t.rule.type === 'duration' ? `${t.rule.target} minutes a day` : t.rule.type === 'count' ? `${t.rule.target} ${t.rule.unit} a day` : scheduleLabel(t.rule)}</small><Plus size={17} className="starter-plus" /></button>)}</div></div> : !due.length ? <Empty title="A little breathing room" text="No habits are due on this date. Enjoy your rest, or make space for a new habit." /> : !visibleHabits.length ? <Empty title={statusFilter === 'todo' && !remaining ? "All clear for the day" : "No matching habits"} text={statusFilter === 'todo' && !remaining ? "You’ve made room for what matters. Enjoy a little breathing space." : "Try another search or clear your filters to see your habits."}><button className="text-button" onClick={() => { setSearch(''); setStatusFilter('all'); setFilter('All habits'); }}>Show all habits</button></Empty> : null}
              {active.length > 0 && <button className="add-habit-row" onClick={() => setHabitForm({})}><Plus size={17} />Make room for another good habit</button>}
            </section>
          </div><aside className="today-aside">
            {state.settings.showXp && <section className="level-card"><div className="section-heading"><span className="journey-label">THE LONG GAME</span><Sparkles size={18} /></div><div className="level-illustration" aria-hidden="true"><span className="star star-one">✦</span><span className="star star-two">✧</span><div className="growth-step step-one"/><div className="growth-step step-two"/><div className="growth-step step-three"><Sprout size={40} /></div><span className="growth-dot" /></div><div className="level-title"><span className="level-medal"><Zap size={18} fill="currentColor" /></span><div><small>Level {level}</small><h2>{level < 3 ? 'Fresh beginnings' : level < 6 ? 'Finding your stride' : level < 11 ? 'Steady grower' : 'In full bloom'}</h2></div></div><div className="level-progress"><span>Progress to level {level + 1}</span><strong>{levelProgress} / {state.settings.levelSize} XP</strong></div><div className="xp-track"><div style={{ width: `${levelProgress / state.settings.levelSize * 100}%` }} /></div><p>{state.settings.levelSize - levelProgress} XP until your next little milestone.</p></section>}
            <section className="mini-stats">{state.settings.showStreaks && <div><span className="stat-icon orange"><Flame size={20} /></span><span><strong>{bestStreak}</strong><small>Best current streak*</small></span></div>}{state.settings.showXp && <div><span className="stat-icon purple"><Zap size={20} /></span><span><strong>{dailyXp} <em>XP</em></strong><small>Earned {date === today ? 'today' : 'this day'}</small></span></div>}{state.settings.showStreaks && <p>*Scheduled days, or weeks for weekly goals.</p>}</section>
            <section className="reward-nudge"><span className="reward-nudge-icon"><Gift size={24} /></span><h3>Effort deserves a little joy.</h3><p>Turn your consistency into something to look forward to.</p><button className="text-button" onClick={() => navigate('rewards')}>Explore your rewards <ArrowUpRight size={16} /></button></section>
          </aside></div>
          <p className="page-footnote"><Sprout size={15} />Progress is personal. Make this space your own.</p>
        </>}
        {page === 'habits' && <><div className="page-heading"><div><p className="date-heading">Built around your life</p><h1>Small habits. Your rules.</h1><p>Adjust your routines as life changes. Your progress stays with you.</p></div><button className="button primary" onClick={() => setHabitForm({})}><Plus size={18} />New habit</button></div><div className="section-heading"><div className="filter-tabs"><button className={!showArchived ? 'active' : ''} onClick={() => setShowArchived(false)}>Active habits <span>{active.length}</span></button><button className={showArchived ? 'active' : ''} onClick={() => setShowArchived(true)}>Archived <span>{state.habits.filter(h => h.archived).length}</span></button></div></div><label className="management-search"><Search size={17} /><input aria-label="Search your habits" placeholder="Search by name or category" value={habitQuery} onChange={e => setHabitQuery(e.target.value)} /></label>{habitQuery.trim() && !managedHabits.length && <p className="empty-inline" role="status">No habits match “{habitQuery}”. Try another name or category.</p>}<div className="habit-list management">{managedHabits.map(h => habitRow(h, true))}</div>{!state.habits.some(h => h.archived === showArchived) && <Empty title={showArchived ? 'Your history has a home' : 'Start with something small'} text={showArchived ? 'Archived habits appear here. Their check-ins and earnings are always preserved.' : 'Create a habit that fits your life. You can fine-tune it anytime.'}>{!showArchived && <button className="button primary" onClick={() => setHabitForm({})}><Plus size={17} />Create your first habit</button>}</Empty>}<div className="tip-banner"><Clock3 size={21} /><div><strong>Build a routine with breathing room.</strong><p>Pause a habit when life gets busy, or use a rest day from Today. Neither takes away your earned progress.</p></div></div></>}
        {page === 'progress' && <ProgressScreen state={state} today={today} busy={busy} run={run} openDay={day => { navigate('today'); setSelectedDate(day); }} />}
        {page === 'rewards' && <RewardsScreen state={state} today={today} busy={busy} run={run} edit={reward => setRewardForm({ reward })} confirm={(title, text, action) => setConfirm({ title, text, action })} />}
        {page === 'settings' && <SettingsScreen state={state} busy={busy} run={run} restore={next => { setState(next); setSelectedDate(null); notify({ message: 'Backup restored. Welcome back.' }); }} notify={message => notify({ message, error: true })} />}
      </main>
    </div>
    {datePickerOpen && <DatePicker date={date} today={today} earliest={earliest} onChoose={setSelectedDate} onClose={() => setDatePickerOpen(false)} />}
    {noteEntry && <NoteForm entry={noteEntry} habitName={state.habits.find(h => h.id === noteEntry.habitId)!.name} busy={busy} run={run} onClose={() => setNoteId(null)} />}
    {habitForm && <HabitForm {...habitForm} settings={state.settings} busy={busy} onClose={() => setHabitForm(null)} onSave={input => run({ type: 'habit.save', habitId: habitForm.habit?.id, input }, habitForm.habit ? 'Habit updated. Rule changes are scheduled.' : 'A new habit, a fresh start.')} />}
    {rewardForm && <RewardForm {...rewardForm} busy={busy} onClose={() => setRewardForm(null)} onSave={input => run({ type: 'reward.save', rewardId: rewardForm.reward?.id, input }, 'Reward saved. Something good to work toward.')} />}
    {logForm && <LogForm habit={logForm.habit} entry={entryFor(state, logForm.habit.id, logForm.date)} date={logForm.date} busy={busy} onClose={() => setLogForm(null)} onSave={value => log(logForm.habit, logForm.date, value)} />}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="confirm-copy">{confirm.text}</p><div className="modal-footer"><button className="button secondary" onClick={() => setConfirm(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={async () => { if (await confirm.action()) setConfirm(null); }}>{busy ? 'Saving…' : 'Confirm'}</button></div></Modal>}
    {help && <Modal title="A little momentum goes a long way" onClose={() => setHelp(false)}><div className="guide"><section className="shortcut-guide" aria-label="Keyboard shortcuts"><h3>Keyboard shortcuts</h3><dl><div><dt><kbd>1</kbd>–<kbd>5</kbd></dt><dd>Switch between the five screens</dd></div><div><dt><kbd>N</kbd></dt><dd>Create a new habit</dd></div><div><dt><kbd>/</kbd></dt><dd>Focus search on the current screen</dd></div><div><dt><kbd>?</kbd></dt><dd>Open this guide</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Close a dialog</dd></div></dl><label className="inline-check"><input type="checkbox" checked={shortcuts.enabled} onChange={event => shortcuts.setEnabled(event.target.checked)} />Enable single-key shortcuts</label><p>Saved on this browser. Shortcuts pause while typing or using a dialog.</p></section><p><strong>Start small.</strong> Create a habit, choose how you track it, and set a schedule that fits.</p><p><strong>Show up.</strong> Check in from Today. Counts and minutes support partial progress. Use the date arrows to fill in a missed check-in.</p><p><strong>Enjoy your progress.</strong> Complete a daily target to earn XP and coins. XP builds your level; coins buy your custom rewards.</p><p><strong>Make room for life.</strong> Rest days protect daily streaks without earning points. Weekly habits count completed weeks; a partly paused week still needs its target. A fully paused week preserves the streak.</p><p><strong>Stay in control.</strong> Change your defaults in Settings. You can undo check-ins and reward redemptions from Progress and Rewards. If you undo coins already spent, your balance can go below zero until you earn them back.</p><p className="notice">This is your private, single-user workspace. Export a backup in Settings to keep a copy of your progress.</p></div></Modal>}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleHelp size={19} /> : <Check size={19} />}<span>{toast.message}</span>{toast.undo && <button onClick={toast.undo}>Undo</button>}<button className="toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16} /></button></div>}
  </div>;
}
function LeafIcon() { return <Sprout size={15} />; }
function SunIcon() { return <Symbol name="sun" size={16} />; }
function LogForm({ habit, entry, date, busy, onClose, onSave }: { habit: Habit; entry?: Entry; date: string; busy: boolean; onClose: () => void; onSave: (value: number) => Promise<boolean> }) {
  const rule = entry?.rule ?? ruleAt(habit, date);
  const [value, setValue] = useState(entry?.value ?? 0);
  const step = rule.type === 'duration' ? 5 : 1;
  return <Modal title={habit.name} onClose={onClose}><form onSubmit={async e => { e.preventDefault(); if (await onSave(value)) onClose(); }}><p className="field-help">{dateLabel(date, { weekday: 'long', month: 'long', day: 'numeric' })} · Goal: {rule.target} {rule.unit}</p><label>Total {rule.unit} for this day<input autoFocus required type="number" min={0} max={rule.target} value={value} onChange={e => setValue(Number(e.target.value))} /></label><div className="quick-add">{[step, step * 2].map(n => <button className="button secondary" type="button" key={n} onClick={() => setValue(Math.min(rule.target, value + n))}>+{n} {rule.unit}</button>)}<button className="button secondary" type="button" onClick={() => setValue(rule.target)}><Check size={16} />Complete goal</button></div><div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save progress'}</button></div></form></Modal>;
}
