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

export function closeDay(date, tasks) {
  return postJson('/api/daily-archives/close-day', { date, tasks });
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
