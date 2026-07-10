export async function decomposeQuests({ tasks, deadlineTasks }) {
  const res = await fetch('/api/quests/decompose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks, deadlineTasks }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '요청에 실패했어요');
  }

  return res.json();
}
