import { useState } from 'react';
import { generatePlan } from '../api.js';
import ChecklistRow from './ChecklistRow.jsx';

let idCounter = 1;
function makeId() {
  return `item-${idCounter++}-${Date.now()}`;
}

export default function DailyPlanner() {
  const [tasksText, setTasksText] = useState('');
  const [items, setItems] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function withUpdatedOrder(nextItems) {
    return nextItems.map((item, index) => ({ ...item, order: index + 1 }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!tasksText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { items: planItems } = await generatePlan({ tasks: tasksText });
      const withState = [...planItems]
        .sort((a, b) => a.order - b.order)
        .map((it) => ({ ...it, id: makeId(), done: false }));
      setItems(withState);
    } catch (err) {
      setError(err.message || '계획을 만드는 데 실패했어요');
    } finally {
      setLoading(false);
    }
  }

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id) {
    setItems((prev) => withUpdatedOrder(prev.filter((it) => it.id !== id)));
  }

  function addItem(type) {
    setItems((prev) => {
      const currentItems = prev || [];
      return [
        ...currentItems,
        {
        id: makeId(),
        type,
        title: type === 'break' ? '잠깐 휴식' : '새 작업',
        targetMinutes: type === 'break' ? 5 : 15,
        order: currentItems.length + 1,
        done: false,
        },
      ];
    });
  }

  function moveItem(sourceId, targetId) {
    if (sourceId === targetId) return;

    setItems((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === sourceId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;

      const nextItems = [...prev];
      const [movedItem] = nextItems.splice(sourceIndex, 1);
      nextItems.splice(targetIndex, 0, movedItem);
      return withUpdatedOrder(nextItems);
    });
  }

  function moveItemBy(id, offset) {
    setItems((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === id);
      const targetIndex = sourceIndex + offset;
      if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= prev.length) return prev;

      const nextItems = [...prev];
      [nextItems[sourceIndex], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[sourceIndex]];
      return withUpdatedOrder(nextItems);
    });
  }

  function handleDrop(e, targetId) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    setDragOverId(null);
    if (sourceId) moveItem(sourceId, targetId);
  }

  return (
    <section className="panel">
      <div className="section-head">
        <span className="section-num">01</span>
        <h2>오늘의 계획</h2>
      </div>

      <form className="task-input" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="daily-tasks">오늘 할 일을 알려주세요</label>
        <textarea
          id="daily-tasks"
          value={tasksText}
          onChange={(e) => setTasksText(e.target.value)}
          placeholder="예: 로그인 리팩토링, PR 리뷰, 문서 정리"
          rows={3}
        />
        <button type="submit" className="btn-primary" disabled={loading || !tasksText.trim()}>
          {loading ? '계획 만드는 중...' : '계획 세우기'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {items && (
        <div className="checklist">
          {items.map((item, index) => (
            <ChecklistRow
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              isDragOver={dragOverId === item.id}
              onUpdate={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              onMoveUp={() => moveItemBy(item.id, -1)}
              onMoveDown={() => moveItemBy(item.id, 1)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverId(item.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null);
              }}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={() => setDragOverId(null)}
            />
          ))}
          <div className="checklist-add-row">
            <button type="button" className="btn-ghost" onClick={() => addItem('task')}>+ 작업 추가</button>
            <button type="button" className="btn-ghost" onClick={() => addItem('break')}>+ 휴식 추가</button>
          </div>
        </div>
      )}
    </section>
  );
}
