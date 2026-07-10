export default function QuestCard({ quest }) {
  return (
    <div className="quest-card">
      <div className="quest-top">
        <div>
          <p className="quest-title">{quest.title}</p>
          <p className="quest-sub">목표 {quest.targetMinutes}분</p>
        </div>
        {quest.deadline && <span className="quest-tag">D · {quest.deadline}</span>}
      </div>
    </div>
  );
}
