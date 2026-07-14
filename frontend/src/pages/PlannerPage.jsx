import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchPlannerData, savePlannerData, closeDay } from '../api.js';
import { toDateKey } from '../utils/calendarGrid.js';
import { useFocusSession } from '../hooks/useFocusSession.js';
import FocusMode from '../components/FocusMode.jsx';
import FocusStartModal from '../components/FocusStartModal.jsx';
import FocusSummaryModal from '../components/FocusSummaryModal.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import DevicePairingModal from '../components/DevicePairingModal.jsx';
import AccountDeletionModal from '../components/AccountDeletionModal.jsx';

let eventCounter = 1;
function makeEventId() {
  return `evt-${eventCounter++}-${Date.now()}`;
}

function navLinkClassName({ isActive }) {
  return `page-nav-link${isActive ? ' is-active' : ''}`;
}

// 하루 마무리 시간이 지나자마자 바로 지워버리면 사용자가 당황할 수 있어서,
// 이 시간만큼 여유를 두고서야 실제로 초기화한다.
const CLOSE_GRACE_MINUTES = 30;

// John이 "롤토체스 2시간 하고 잠에 들 거야"처럼 밤 시간대에 대화하면
// dayEndTime이 자정을 넘긴 값(예: "00:40")으로 나올 수 있다. 이걸 무조건
// "오늘 날짜의 00:40"으로 보면, 저녁에 대화했는데 이미 몇 시간 전에 지난
// 것처럼 계산되어 방금 만든 계획이 바로 초기화되어버린다. 새벽 시간대
// (0~5시)인데 지금이 이미 그 시각을 지난 저녁/밤이라면, 자정을 넘겨서
// "내일 새벽"을 뜻하는 것으로 보고 날짜를 하루 미룬다.
function resolveDayEndDate(time) {
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  if (Number.isNaN(h) || Number.isNaN(m)) return toDateKey(now);

  const candidate = new Date();
  candidate.setHours(h, m, 0, 0);
  if (h < 6 && candidate < now) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return toDateKey(candidate);
}

function shouldCloseDay(dayEndDate, dayEndTime) {
  if (!dayEndDate || !dayEndTime) return false;
  const todayKey = toDateKey(new Date());
  if (dayEndDate < todayKey) return true; // 하루 이상 지난 채로 남아있던 경우 — 바로 정리
  if (dayEndDate > todayKey) return false;

  const [h, m] = dayEndTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const deadline = new Date();
  deadline.setHours(h, m, 0, 0);
  deadline.setMinutes(deadline.getMinutes() + CLOSE_GRACE_MINUTES);
  return new Date() >= deadline;
}

export default function PlannerPage() {
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [dayEndTime, setDayEndTime] = useState(null);
  const [dayEndDate, setDayEndDate] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [closeNotice, setCloseNotice] = useState(null);
  const saveQueueRef = useRef(Promise.resolve());
  // StrictMode가 마운트 시 effect를 두 번 실행해도, closingRef를 동기적으로
  // 먼저 세워두면 두 번째 호출이 곧바로 걸러진다 (기록이 빈 목록으로
  // 덮어써지는 걸 방지).
  const closingRef = useRef(false);
  const { user, logout, deleteAccount } = useAuth();

  // 데스크톱(일렉트론)에서만 켜지는 집중 모드. 웹 브라우저에서는 isDesktop이
  // false라 아무 것도 렌더링하지 않는다.
  const { isDesktop, state: focusState, now: focusNow, controls: focusControls } = useFocusSession();
  const [focusModalOpen, setFocusModalOpen] = useState(false);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [accountDeletionOpen, setAccountDeletionOpen] = useState(false);
  const focusActive = Boolean(focusState && focusState.status !== 'idle');
  const completedFocusSummary = focusState?.lastCompletedSummary || null;

  // 마감/캘린더 페이지는 캘린더를 가로로 넓게 쓰도록 컨테이너를 넓힌다.
  const location = useLocation();
  const isDeadlines = location.pathname.startsWith('/deadlines');

  useEffect(() => {
    let cancelled = false;

    fetchPlannerData()
      .then((data) => {
        if (cancelled) return;
        setTasks(data.tasks || []);
        setEvents(data.events || []);
        setDayEndTime(data.dayEndTime || null);
        setDayEndDate(data.dayEndDate || null);
        setDataReady(true);
      })
      .catch((err) => {
        if (!cancelled) setStorageError(err.message || '저장된 플래너를 불러오지 못했어요');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!dataReady) return undefined;

    const timer = setTimeout(() => {
      const snapshot = { tasks, events, dayEndTime, dayEndDate };
      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() => savePlannerData(snapshot))
        .then(() => setStorageError(null))
        .catch((err) => setStorageError(err.message || '변경사항을 저장하지 못했어요'));
    }, 350);

    return () => clearTimeout(timer);
  }, [tasks, events, dayEndTime, dayEndDate, dataReady]);

  // 계획표의 휴식 시작 시각을 Electron 메인 프로세스에 넘겨, 창이 최소화돼도
  // 정확한 시각에 알림을 띄울 수 있게 한다. 웹에서는 브리지가 없어 no-op이다.
  useEffect(() => {
    if (!dataReady || !isDesktop) return;
    window.zonemate?.syncPlannedBreaks?.({ tasks, dayEndDate });
  }, [dataReady, isDesktop, tasks, dayEndDate]);

  // 하루 마무리 시간 + 유예시간이 지났는지 주기적으로 확인해서, 지났으면
  // 오늘의 계획을 캘린더 기록으로 넘기고 새 하루를 시작할 수 있게 비운다.
  useEffect(() => {
    if (!dataReady) return undefined;

    function checkAndClose() {
      if (closingRef.current) return;
      if (!shouldCloseDay(dayEndDate, dayEndTime)) return;

      closingRef.current = true;
      const dateToClose = dayEndDate;
      closeDay(dateToClose, tasks, dayEndTime)
        .then(() => {
          setTasks([]);
          setDayEndTime(null);
          setDayEndDate(null);
          setCloseNotice(dateToClose);
        })
        .catch((err) => setStorageError(err.message || '하루 마감 처리에 실패했어요'))
        .finally(() => {
          closingRef.current = false;
        });
    }

    checkAndClose();
    const interval = setInterval(checkAndClose, 60000);
    return () => clearInterval(interval);
    // tasks도 의존성에 넣어서, 유예시간이 지나 실제로 닫힐 때 그 순간의
    // 최신 체크리스트(완료 여부 포함)가 아카이빙되도록 한다.
  }, [dataReady, dayEndDate, dayEndTime, tasks]);

  function addEvent(event) {
    setEvents((prev) => [...prev, { ...event, id: event.id || makeEventId() }]);
  }

  function updateEvent(id, patch) {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)));
  }

  function removeEvent(id) {
    // 마감(부모) 이벤트를 지우면, 거기서 파생된 로드맵 단계 이벤트(parentId로 연결)도 같이 지운다
    setEvents((prev) => prev.filter((ev) => ev.id !== id && ev.parentId !== id));
  }

  function setDayEnd(time) {
    setDayEndTime(time);
    setDayEndDate(time ? resolveDayEndDate(time) : null);
  }

  // 집중 모드가 켜져 있으면 다른 화면(플래너/캘린더)을 전부 덮고 집중 대시보드만
  // 보여준다 — "집중 중에는 다른 화면이 나오지 않도록" 요청 반영.
  if (isDesktop && focusActive) {
    return <FocusMode state={focusState} now={focusNow} controls={focusControls} />;
  }

  return (
    <div className="page">
      {completedFocusSummary && (
        <FocusSummaryModal summary={completedFocusSummary} onClose={focusControls.dismissSummary} />
      )}
      <div className={`wrap${isDeadlines ? ' wrap-wide' : ''}`}>
        <header className="topbar">
          <div className="wordmark"><b>Zone</b>mate</div>
          <div className="topbar-user">
            {isDesktop && (
              <button type="button" className="btn-primary" onClick={() => setFocusModalOpen(true)}>
                집중하기
              </button>
            )}
            <span className="mono">{user?.nickname}님</span>
            <button type="button" className="btn-ghost" onClick={() => setDeviceModalOpen(true)}>기기 연동</button>
            <ThemeToggle />
            <button type="button" className="btn-ghost" onClick={logout}>로그아웃</button>
            <button type="button" className="btn-ghost account-delete-trigger" onClick={() => setAccountDeletionOpen(true)}>
              회원탈퇴
            </button>
          </div>
        </header>

        {focusModalOpen && (
          <FocusStartModal controls={focusControls} tasks={tasks} onClose={() => setFocusModalOpen(false)} />
        )}
        {deviceModalOpen && (
          <DevicePairingModal onClose={() => setDeviceModalOpen(false)} />
        )}
        {accountDeletionOpen && (
          <AccountDeletionModal onClose={() => setAccountDeletionOpen(false)} onDelete={deleteAccount} />
        )}

        <nav className="page-nav">
          <NavLink to="/today" className={navLinkClassName}>오늘의 계획</NavLink>
          <NavLink to="/deadlines" className={navLinkClassName}>마감 태스크 & 캘린더</NavLink>
        </nav>

        {storageError && <p className="error-text">{storageError}</p>}

        {closeNotice && (
          <p className="hint-text">
            {closeNotice}의 하루 계획을 캘린더 기록으로 저장하고 새로 시작할 수 있게 비웠어요. 캘린더에서 그날을 눌러 확인할 수 있어요.{' '}
            <button type="button" className="btn-link" onClick={() => setCloseNotice(null)}>닫기</button>
          </p>
        )}

        {dataReady ? (
          <Outlet context={{ tasks, setTasks, events, addEvent, updateEvent, removeEvent, dayEndTime, setDayEnd }} />
        ) : !storageError ? (
          <section className="panel"><p className="hint-text">저장된 플래너를 불러오는 중...</p></section>
        ) : null}
      </div>
    </div>
  );
}
