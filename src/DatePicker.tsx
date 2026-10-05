import { useState } from 'react';
import { Modal } from './ui';

export function DatePicker({ date, today, earliest, onChoose, onClose }: {
  date: string; today: string; earliest: string; onChoose: (date: string) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState(date);
  return <Modal title="Jump to a day" onClose={onClose}><form onSubmit={event => { event.preventDefault(); onChoose(selected); onClose(); }}>
    <p className="field-help">Revisit a day or fill in a missed check-in. Your saved schedule determines which habits are available.</p>
    <label>Check-in date<input type="date" required autoFocus min={earliest} max={today} value={selected} onChange={event => setSelected(event.target.value)} /></label>
    <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={!selected || selected < earliest || selected > today}>View day</button></div>
  </form></Modal>;
}
