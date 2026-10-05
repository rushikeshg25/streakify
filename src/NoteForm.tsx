import { useId, useState } from 'react';
import type { Entry } from '../shared/model';
import type { RunCommand } from './App';
import { dateLabel, Modal } from './ui';

export function NoteForm({ entry, habitName, busy, run, onClose }: {
  entry: Entry; habitName: string; busy: boolean; run: RunCommand; onClose: () => void;
}) {
  const fieldId = useId();
  const [note, setNote] = useState(entry.note ?? '');
  return <Modal title="A note to remember" onClose={() => !busy && onClose()}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (await run({ type: 'entry.note', entryId: entry.id, note }, note.trim() ? 'Note saved.' : 'Note removed.')) onClose();
    }}>
      <p className="field-help">{habitName} · {dateLabel(entry.date)}</p>
      <label htmlFor={fieldId}>Check-in note</label><textarea id={fieldId} autoFocus rows={5} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="What helped you show up? What would you try next time?" />
      <div className="note-caption"><span>Only for you. Your earnings stay the same.</span><span>{note.length}/500</span></div>
      <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save note'}</button></div>
    </form>
  </Modal>;
}
