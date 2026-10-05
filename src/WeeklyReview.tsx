import { ArrowDownRight, ArrowUpRight, CalendarCheck, Minus } from 'lucide-react';
import type { State } from '../shared/model';
import { weeklyReview } from '../shared/insights';
import { dateLabel, Symbol } from './ui';

export function WeeklyReview({ state, today, habitId }: { state: State; today: string; habitId: string }) {
  const review = weeklyReview(state, today, habitId);
  const Trend = review.difference > 0 ? ArrowUpRight : review.difference < 0 ? ArrowDownRight : Minus;
  return <section className="panel weekly-review" aria-labelledby="weekly-review-title">
    <div className="section-heading"><div><p className="section-eyebrow">A MOMENT TO REFLECT</p><h2 id="weekly-review-title">Your week, so far</h2></div><span className="review-period">{dateLabel(review.start)} – {dateLabel(today)}</span></div>
    <div className="review-layout"><div className="review-summary"><strong className="review-count">{review.completions}<span> check-ins</span></strong>
      <p className={`review-trend ${review.difference > 0 ? 'positive' : ''}`}><Trend size={17} />{review.difference === 0 ? 'The same number as' : `${Math.abs(review.difference)} ${review.difference > 0 ? 'more' : 'fewer'} than`} this point last week.</p>
      <p className="review-context">Compared with {dateLabel(review.previousStart)}–{dateLabel(review.previousEnd)}. Every week has its own pace.</p>
      <div className="review-facts"><span><CalendarCheck size={16} />{review.activeDays} active {review.activeDays === 1 ? 'day' : 'days'}</span><span>{review.restDays} rest {review.restDays === 1 ? 'day' : 'days'}</span>{state.settings.showXp && <span>{review.xp} XP earned</span>}</div>
    </div><div className="review-leaders"><h3>Habits you showed up for</h3>{review.leaders.length ? review.leaders.map(habit => <div className="review-habit" key={habit.id}><span className={`habit-icon small ${habit.color}`}><Symbol name={habit.icon} size={18} /></span><span>{habit.name}</span><strong>{habit.count}<small> check-ins</small></strong></div>) : <p>Once you check in, your most practiced habits will appear here.</p>}</div></div>
  </section>;
}
