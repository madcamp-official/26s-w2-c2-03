const pad = (n) => String(n).padStart(2, '0');

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

export function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 항상 42칸(6주 x 7일)짜리 그리드를 반환 — 이전/다음 달의 날짜로 앞뒤를 채움
export function buildMonthGrid(monthDate) {
  const first = startOfMonth(monthDate);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

// datetime-local input과 Date 객체 사이를 로컬 시간 기준으로 변환.
// toISOString()을 쓰면 UTC로 바뀌어서 시간이 밀리는 버그가 생기므로 직접 포맷.
export function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 날짜(day)만 옮기고 기존 이벤트의 시:분은 그대로 유지
export function moveDateKeepTime(originalDateStr, targetDay) {
  const original = new Date(originalDateStr);
  const hours = Number.isNaN(original.getTime()) ? 9 : original.getHours();
  const minutes = Number.isNaN(original.getTime()) ? 0 : original.getMinutes();
  const moved = new Date(targetDay);
  moved.setHours(hours, minutes, 0, 0);
  return toLocalInputValue(moved);
}
