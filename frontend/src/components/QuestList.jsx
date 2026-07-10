import QuestCard from './QuestCard.jsx';

export default function QuestList({ quests }) {
  const sorted = [...quests].sort((a, b) => a.order - b.order);

  return (
    <section>
      <div className="section-head">
        <span className="section-num">{String(sorted.length).padStart(2, '0')}</span>
        <h2>오늘의 퀘스트</h2>
      </div>
      <div className="quest-stack">
        {sorted.map((q) => (
          <QuestCard key={q.order} quest={q} />
        ))}
      </div>
    </section>
  );
}
