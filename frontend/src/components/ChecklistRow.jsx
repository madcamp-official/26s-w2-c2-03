export default function ChecklistRow({
  item,
  isDragOver,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) {
  return (
    <div
      className={`checklist-row${item.type === 'break' ? ' is-break' : ''}${item.done ? ' is-done' : ''}${isDragOver ? ' is-drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="drag-handle"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-label={`${item.title} 순서 끌어서 변경`}
        title="끌어서 순서 변경"
      >
        ⠿
      </button>
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
        type="time"
        className="checklist-time-input num"
        value={item.startTime || ''}
        onChange={(e) => onUpdate({ startTime: e.target.value || undefined })}
        title="시작 시간"
      />
      <input
        type="number"
        className="checklist-minutes-input num"
        min={1}
        value={item.targetMinutes}
        onChange={(e) => onUpdate({ targetMinutes: Number(e.target.value) })}
      />
      <span className="mono unit-label">분</span>
      <button type="button" className="row-remove" onClick={onRemove} aria-label="항목 삭제">×</button>
    </div>
  );
}
