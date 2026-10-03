import { useEffect, useRef, useState } from 'react';
import { Activity, BookOpen, Brain, Code2, Coffee, Compass, Droplets, Film, Flame, Gamepad2, Gift, Heart, Leaf, Sparkles, Sun, Utensils, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Rule } from '../shared/model';

export const icons: Record<string, LucideIcon> = { book: BookOpen, water: Droplets, move: Activity, mind: Brain, sun: Sun, code: Code2, leaf: Leaf, heart: Heart, coffee: Coffee, film: Film, gift: Gift, game: Gamepad2, food: Utensils, trip: Compass, flame: Flame, sparkles: Sparkles, zap: Zap };
export function Symbol({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) { const Icon = icons[name] ?? Sparkles; return <Icon size={size} strokeWidth={1.8} className={className} aria-hidden="true" />; }
export function Coin({ size = 16 }: { size?: number }) { return <span className="coin" style={{ width: size, height: size, fontSize: size * .65 }} aria-hidden="true">✦</span>; }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [returnFocus] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; returnFocus?.focus({ preventScroll: true }); };
  }, [returnFocus]);
  useEffect(() => { const report = (event: Event) => setError((event as CustomEvent<string>).detail); window.addEventListener('streakify:error', report); return () => window.removeEventListener('streakify:error', report); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) { const rect = ref.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}>
    <div className="modal-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{error && <p className="error-banner" role="alert">{error}</p>}{children}
  </dialog>;
}
export const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function scheduleLabel(rule: Rule) { return rule.schedule === 'daily' ? 'Every day' : rule.schedule === 'weekly' ? `${rule.weeklyTarget} times a week` : [...rule.days].sort((a,b) => ((a+6)%7)-((b+6)%7)).map(d => days[d]).join(', '); }
export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { ...options, timeZone: 'UTC' }); }
export function Empty({ icon = 'leaf', title, text, children }: { icon?: string; title: string; text: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Symbol name={icon} size={30} /></span><h3>{title}</h3><p>{text}</p>{children}</div>;
}
