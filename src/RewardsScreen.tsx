import { useState } from 'react';
import { Archive, Gift, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import type { Reward, State } from '../shared/model';
import { balances, rewardAvailable } from '../shared/model';
import type { RunCommand } from './App';
import { Coin, dateLabel, Empty, Symbol } from './ui';

type Props = { state: State; today: string; busy: boolean; run: RunCommand; edit: (reward?: Reward) => void; confirm: (title: string, text: string, action: () => Promise<boolean>) => void };
export function RewardsScreen({ state, today, busy, run, edit, confirm }: Props) {
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [affordableOnly, setAffordableOnly] = useState(false);
  const balance = balances(state);
  const active = state.rewards.filter(reward => !reward.archived);
  const rewards = state.rewards.filter(reward => reward.archived === archived)
    .filter(reward => `${reward.name} ${reward.description}`.toLowerCase().includes(query.trim().toLowerCase()))
    .filter(reward => archived || !affordableOnly || (balance.coins >= reward.cost && rewardAvailable(state, reward, today)));
  const redemptions = [...state.redemptions].reverse();
  return <>
    <div className="page-heading"><div><p className="date-heading">A little something, well earned</p><h1>Make the effort feel good.</h1><p>Your rewards, your motivation. Choose what brings you joy.</p></div><button className="button primary" onClick={() => edit()}><Plus size={18} />New reward</button></div>
    <div className="wallet-banner"><span className="wallet-icon"><Coin size={34} /></span><div><span>Your reward wallet</span><h2>{balance.coins} <small>coins to spend</small></h2></div><p>Earn coins by completing habits.<br />Spend them on moments that matter to you.</p></div>
    {balance.coins < 0 && <p className="notice">Some spent coins were undone. New earnings will restore your balance, or you can return a reward below.</p>}
    <div className="rewards-toolbar"><div className="status-tabs" aria-label="Reward library"><button aria-pressed={!archived} onClick={() => setArchived(false)}>Available rewards {active.length}</button><button aria-pressed={archived} onClick={() => setArchived(true)}>Archived rewards {state.rewards.length - active.length}</button></div>
      <label className="habit-search"><Search size={16} /><input aria-label="Search rewards" placeholder="Find a reward…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {!archived && <label className="inline-check"><input type="checkbox" checked={affordableOnly} onChange={event => setAffordableOnly(event.target.checked)} />Ready to redeem</label>}
    </div>
    {!rewards.length ? <Empty icon="gift" title={archived ? 'Keep the possibilities open' : query || affordableOnly ? 'Nothing here just yet' : 'What would make your day?'} text={archived ? 'Archived rewards live here. Restore one whenever it feels right again.' : query || affordableOnly ? 'Try another search or turn off the filter to see all your rewards.' : 'A good coffee. A new book. An afternoon for yourself. Give your effort something to look forward to.'}>
      {!archived && !query && !affordableOnly && <button className="button primary" onClick={() => edit()}><Plus size={17} />Create a reward</button>}
      {(query || affordableOnly) && <button className="text-button" onClick={() => { setQuery(''); setAffordableOnly(false); }}>Clear reward filters</button>}
    </Empty> : <div className="rewards-grid">{rewards.map((reward, index) => {
      const available = rewardAvailable(state, reward, today);
      const canBuy = balance.coins >= reward.cost && available;
      const progress = Math.max(0, Math.min(balance.coins, reward.cost));
      return <article className="reward-card" key={reward.id}>
        <div className="reward-card-top"><span className={`reward-art reward-color-${index % 3}`}><Symbol name={reward.icon} size={34} /></span><div className="reward-edit">
          <button className="icon-button" aria-label={`Edit ${reward.name}`} onClick={() => edit(reward)}><Pencil size={16} /></button>
          {!archived && <button className="icon-button" aria-label={`Archive ${reward.name}`} disabled={busy} onClick={() => confirm('Archive this reward?', `“${reward.name}” will leave your reward shop. Past redemptions stay in your history. You can restore it later.`, () => run({ type: 'reward.archive', rewardId: reward.id }, 'Reward archived.'))}><Archive size={16} /></button>}
        </div></div>
        <h3>{reward.name}</h3><p>{reward.description || 'A little joy, earned your way.'}</p>
        <small className="reward-limit">{reward.limit === 'none' ? 'Enjoy whenever you earn it' : reward.limit === 'daily' ? 'Once per day' : 'Once per week'}</small>
        {!archived && <div className="reward-saving"><div className="saving-label"><span>{canBuy ? 'Ready when you are' : !available ? 'Enjoy your well-earned reward' : `${reward.cost - progress} coins to go`}</span><span>{progress}/{reward.cost}</span></div><div className="xp-track" role="progressbar" aria-label={`Savings for ${reward.name}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={reward.cost}><div style={{ width: `${progress / reward.cost * 100}%` }} /></div></div>}
        <div className="reward-bottom"><strong><Coin size={20} />{reward.cost}</strong>{archived ? <button className="button secondary" disabled={busy} aria-label={`Restore ${reward.name}`} onClick={() => void run({ type: 'reward.archive', rewardId: reward.id, archived: false }, 'Reward restored.')}><RotateCcw size={15} />Restore</button> : <button className={`button ${canBuy ? 'primary' : 'secondary'}`} disabled={busy || !canBuy} onClick={() => confirm('Enjoy your reward?', `Spend ${reward.cost} coins on “${reward.name}”? This records your personal reward; it doesn’t make a purchase.`, () => run({ type: 'reward.redeem', rewardId: reward.id }, 'Reward redeemed. Enjoy it!'))}>{!available ? 'Claimed for now' : canBuy ? 'Redeem' : `${Math.max(0, reward.cost - balance.coins)} more coins`}</button>}</div>
      </article>;
    })}</div>}
    <section className="panel history-panel"><div className="section-heading"><h2>Your little celebrations</h2><Gift size={20} /></div>{!redemptions.length ? <p className="empty-inline">Your redeemed rewards will appear here. Good things are ahead.</p> : redemptions.map(redemption => <div className="history-row" key={redemption.id}><span className="habit-icon small orange"><Gift size={19} /></span><div><strong>{redemption.name}</strong><small>{dateLabel(redemption.date)} · {redemption.undone ? 'Returned' : 'Redeemed'}</small></div><span className="history-earnings">{redemption.undone ? 'Refunded' : `−${redemption.cost}`} {!redemption.undone && <Coin size={14} />}</span>{!redemption.undone && <button className="text-button" disabled={busy} onClick={() => confirm('Return this reward?', `${redemption.cost} coins will go back into your wallet.`, () => run({ type: 'redemption.undo', redemptionId: redemption.id }, 'Reward returned. Coins refunded.'))}><RotateCcw size={15} />Return</button>}</div>)}</section>
  </>;
}
