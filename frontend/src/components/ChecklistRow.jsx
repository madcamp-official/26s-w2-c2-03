export default function ChecklistRow({ item, onUpdate, onRemove }) {
  return (
    <div className={`checklist-row${item.type === 'break' ? ' is-break' : ''}${item.done ? ' is-done' : ''}`}>
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => onUpdate({ done: e.target.checked })}
        aria-label={`${item.title} 완료`}
      />
      {item.type === 'break' && <span className="type-tag tag-noise">휴식</span>}
      <input
        type="text"
        className="checklist-title-input"
        value={item.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
      />
      <input
        type="number"
        className="checklist-minutes-input"
        min={1}
        value={item.targetMinutes}
        onChange={(e) => onUpdate({ targetMinutes: Number(e.target.value) })}
      />
      <span className="mono unit-label">분</span>
      <button type="button" className="row-remove" onClick={onRemove} aria-label="항목 삭제">×</button>
    </div>
  );
}
