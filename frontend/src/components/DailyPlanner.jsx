import { useState } from 'react';
import { generatePlanChat } from '../api.js';
import ChecklistRow from './ChecklistRow.jsx';
import BotAvatar from './BotAvatar.jsx';
import DayWheel from './DayWheel.jsx';

let idCounter = 1;
function makeId() {
  return `item-${idCounter++}-${Date.now()}`;
}

const INITIAL_BOT_MESSAGE = '오늘 할 일을 편하게 알려주세요. 짧게 적어도 괜찮아요, 필요하면 제가 한두 가지만 더 물어볼게요.';

export default function DailyPlanner({ items, onItemsChange, dayEndTime, onDayEndTimeChange }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [dragOverId, setDragOverId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [planDone, setPlanDone] = useState(false);
  const [showWheel, setShowWheel] = useState(false);

  const questionCount = messages.filter((m) => m.role === 'assistant').length;

  function withUpdatedOrder(nextItems) {
    return nextItems.map((item, index) => ({ ...item, order: index + 1 }));
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || loading || planDone) return;

    const nextMessages = [...messages, { role: 'user', text }];
    setMessages(nextMessages);
    setDraft('');
    setLoading(true);
    setError(null);

    try {
      const forceFinalize = questionCount >= 2;
      const result = await generatePlanChat({ messages: nextMessages, forceFinalize });

      if (result.done) {
        setMessages((prev) => [...prev, { role: 'assistant', text: '계획을 만들었어요. 아래에서 확인하고 필요하면 직접 수정하세요.' }]);
        const withState = [...result.items]
          .sort((a, b) => a.order - b.order)
          .map((it) => ({ ...it, id: makeId(), done: false }));
        // 2번 항목(마감 태스크) 로드맵에서 자동으로 끼워 넣은 항목
        // (sourceEventId가 있는 항목)은 John이 새 계획을 짤 때도
        // 지워지지 않게 남겨둔다.
        onItemsChange((prev) => {
          const preserved = (prev || []).filter((it) => it.sourceEventId);
          return withUpdatedOrder([...withState, ...preserved]);
        });
        if (result.dayEndTime) onDayEndTimeChange(result.dayEndTime);
        setPlanDone(true);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: result.question }]);
      }
    } catch (err) {
      setError(err.message || '대화를 진행하는 데 실패했어요');
    } finally {
      setLoading(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setDraft('');
    setError(null);
    setPlanDone(false);
    setShowWheel(false);
  }

  function updateItem(id, patch) {
    onItemsChange((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id) {
    onItemsChange((prev) => withUpdatedOrder(prev.filter((it) => it.id !== id)));
  }

  function addItem(type) {
    onItemsChange((prev) => {
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

    onItemsChange((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === sourceId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;

      const nextItems = [...prev];
      const [movedItem] = nextItems.splice(sourceIndex, 1);
      nextItems.splice(targetIndex, 0, movedItem);
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
        <h2>오늘의 계획</h2>
      </div>

      <div className="chat-panel">
        <div className="chat-persona">
          <BotAvatar size={36} />
          <div className="chat-persona-info">
            <span className="chat-persona-name">John</span>
            <span className="chat-persona-role">오늘의 계획을 같이 세워주는 보조 도구</span>
          </div>
        </div>

        <div className="chat-log">
          <div className="chat-message">
            <BotAvatar size={22} />
            <div className="chat-bubble chat-bubble-bot">{INITIAL_BOT_MESSAGE}</div>
          </div>
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="chat-message chat-message-user">
                <div className="chat-bubble chat-bubble-user">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="chat-message">
                <BotAvatar size={22} />
                <div className="chat-bubble chat-bubble-bot">{m.text}</div>
              </div>
            )
          )}
          {loading && (
            <div className="chat-message">
              <BotAvatar size={22} />
              <div className="chat-bubble chat-bubble-bot chat-bubble-loading">생각하는 중...</div>
            </div>
          )}
        </div>

        {planDone ? (
          <div className="chat-panel-actions">
            <button type="button" className="btn-link" onClick={resetChat}>새 대화로 다시 계획 짜기</button>
            <button type="button" className="btn-ghost" onClick={() => setShowWheel((v) => !v)}>
              {showWheel ? '시간표 접기' : '시간표 생성하기'}
            </button>
          </div>
        ) : (
          <form className="chat-input-row" onSubmit={sendMessage}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="예: 로그인 리팩토링, PR 리뷰, 문서 정리"
              disabled={loading}
            />
            <button type="submit" className="btn-primary" disabled={loading || !draft.trim()}>
              보내기
            </button>
          </form>
        )}

        {showWheel && <DayWheel items={items || []} dayEndTime={dayEndTime} />}
      </div>

      {error && <p className="error-text">{error}</p>}

      {items && (
        <div className="checklist">
          {items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              isDragOver={dragOverId === item.id}
              onUpdate={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
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

          <div className="day-end-row">
            <label className="day-end-label" htmlFor="day-end-time">하루 마무리 시간</label>
            <input
              id="day-end-time"
              type="time"
              className="day-end-input mono"
              value={dayEndTime || ''}
              onChange={(e) => onDayEndTimeChange(e.target.value || null)}
            />
            <span className="day-end-hint hint-text">이 시간이 지나면 오늘 계획을 캘린더 기록으로 넘기고 새로 시작해요.</span>
          </div>
        </div>
      )}
    </section>
  );
}
