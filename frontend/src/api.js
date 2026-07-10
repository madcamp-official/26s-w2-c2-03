async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || '요청에 실패했어요');
  }

  return res.json();
}

export function generatePlan({ tasks }) {
  return postJson('/api/plan', { tasks });
}

export function generateDeadlineRoadmap({ description, deadline }) {
  return postJson('/api/deadline-tasks', { description, deadline });
}
