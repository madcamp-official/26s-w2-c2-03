async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || '요청에 실패했어요');
  }

  return res.json();
}

async function getJson(url) {
  const res = await fetch(url, { credentials: 'include' });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || '요청에 실패했어요');
  }

  return res.json();
}

async function putJson(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || '저장에 실패했어요');
  }

  return res.json();
}

async function deleteJson(url, body) {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || '삭제에 실패했어요');
  }

  return res.json();
}

export function generatePlanChat({ messages, forceFinalize }) {
  return postJson('/api/plan', { messages, forceFinalize });
}

export function generateDeadlineRoadmap({ title, details, deadline }) {
  return postJson('/api/deadline-tasks', { title, details, deadline });
}

export function fetchPlannerData() {
  return getJson('/api/planner-data');
}

export function savePlannerData({ tasks, events, dayEndTime, dayEndDate }) {
  return putJson('/api/planner-data', { tasks, events, dayEndTime, dayEndDate });
}

export function fetchDailyArchive(date) {
  return getJson(`/api/daily-archives/${date}`);
}

export function closeDay(date, tasks, dayEndTime) {
  return postJson('/api/daily-archives/close-day', { date, tasks, dayEndTime });
}

export function saveDailyArchive(date, tasks, dayEndTime) {
  return putJson(`/api/daily-archives/${date}`, { tasks, dayEndTime });
}

export function fetchFocusDay(date) {
  return getJson(`/api/focus-events/day/${date}`);
}

// ---- auth ----

export function sendVerificationCode({ email, password, passwordConfirm }) {
  return postJson('/api/auth/email/send-code', { email, password, passwordConfirm });
}

export function verifyEmailCode({ email, code }) {
  return postJson('/api/auth/email/verify', { email, code });
}

export function login({ email, password }) {
  return postJson('/api/auth/login', { email, password });
}

export function setNickname(nickname) {
  return postJson('/api/auth/nickname', { nickname });
}

export function fetchMe() {
  return getJson('/api/auth/me');
}

export function logout() {
  return postJson('/api/auth/logout', {});
}

export function deleteAccount() {
  return deleteJson('/api/auth/account', { confirmation: '탈퇴' });
}

// ---- 기기 연동 ----

export function requestPairingCode() {
  return postJson('/api/devices/pairing-code', {});
}

export function fetchDevices() {
  return getJson('/api/devices');
}

export async function renameDevice(id, name) {
  const res = await fetch(`/api/devices/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || '이름 변경에 실패했어요');
  }
  return res.json();
}

export async function removeDevice(id) {
  const res = await fetch(`/api/devices/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || '연동 해제에 실패했어요');
  }
  return res.json();
}
