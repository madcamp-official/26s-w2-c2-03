import { useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import DailyPlanner from '../components/DailyPlanner.jsx';
import { toDateKey } from '../utils/calendarGrid.js';

let idCounter = 1;
function makeId() {
  return `roadmap-item-${idCounter++}-${Date.now()}`;
}

export default function TodayPage() {
  const { tasks, setTasks, events, dayEndTime, setDayEnd } = useOutletContext();
  // 리액트 개발 모드(StrictMode)는 마운트 시 effect를 두 번 실행해서 부수효과
  // 중복 여부를 검사한다. setTasks는 함수형 업데이트를 쓰더라도 이 컴포넌트의
  // useRef는 두 번의 effect 호출 사이에 공유되므로, ref에 "이미 추가한 이벤트
  // id"를 동기적으로 기록해두면 두 번째 호출이 확실히 걸러진다.
  const addedEventIdsRef = useRef(new Set());

  // 2번 항목(마감 태스크)의 로드맵에서 나온 일정 중 오늘이거나 이미 지난
  // 것을, 사용자가 챗봇에 다시 말하지 않아도 오늘의 계획에 자동으로 끼워
  // 넣는다. sourceEventId로 이미 추가된 항목을 걸러 중복 추가를 막는다.
  useEffect(() => {
    const todayKey = toDateKey(new Date());
    const due = events.filter((ev) => {
      if (ev.kind !== 'roadmap' || addedEventIdsRef.current.has(ev.id)) return false;
      const evDate = new Date(ev.date);
      if (Number.isNaN(evDate.getTime())) return false;
      return toDateKey(evDate) <= todayKey;
    });
    if (due.length === 0) return;

    due.forEach((ev) => addedEventIdsRef.current.add(ev.id));

    setTasks((prev) => {
      const existingSourceIds = new Set(prev.map((t) => t.sourceEventId).filter(Boolean));
      const toAppend = due.filter((ev) => !existingSourceIds.has(ev.id));
      if (toAppend.length === 0) return prev;

      const appended = toAppend.map((ev, i) => ({
        id: makeId(),
        type: 'task',
        title: ev.title,
        targetMinutes: 30,
        order: prev.length + i + 1,
        done: false,
        sourceEventId: ev.id,
      }));
      return [...prev, ...appended];
    });
  }, [events, setTasks]);

  return (
    <DailyPlanner
      items={tasks}
      onItemsChange={setTasks}
      dayEndTime={dayEndTime}
      onDayEndTimeChange={setDayEnd}
    />
  );
}
