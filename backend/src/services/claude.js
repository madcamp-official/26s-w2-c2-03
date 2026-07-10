import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 ADHD가 있는 개발자의 하루 계획을 돕는 보조 도구입니다.
사용자가 말한 "오늘 할 일"과 "마감이 있는 태스크"를 받아서, 실행 가능한 작은 퀘스트로 쪼갭니다.

규칙:
- 하나의 퀘스트는 5~30분 안에 끝낼 수 있는 크기여야 합니다. 막연하고 큰 작업("리팩토링하기")은 반드시 더 작은 단위로 쪼개세요.
- targetMinutes는 낙관적으로 잡지 말고, ADHD의 시간 감각 왜곡을 고려해 약간 여유 있게 잡으세요.
- 마감이 있는 태스크에서 나온 퀘스트는 반드시 그 마감 전에 끝나도록 순서를 앞쪽에 배치하고, deadline 필드를 그 마감 시각(HH:mm)으로 채우세요.
- 마감이 없는 일반 태스크의 퀘스트는 deadline을 null로 둡니다.
- 퀘스트 제목은 "무엇을 할지"가 명확하게 드러나는 짧은 동사구로 쓰세요.
- 판단하거나 훈계하는 말투를 쓰지 마세요. 그냥 실행 가능한 항목만 나열하세요.`;

const QUEST_TOOL = {
  name: 'emit_quests',
  description: '오늘 할 일을 실행 가능한 작은 퀘스트 목록으로 분해해 반환한다',
  input_schema: {
    type: 'object',
    properties: {
      quests: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '퀘스트 제목, 구체적이고 짧게' },
            targetMinutes: { type: 'integer', description: '예상 소요 시간(분), 5~30 사이 권장' },
            deadline: { type: ['string', 'null'], description: '이 퀘스트가 지켜야 할 마감 시각(HH:mm), 없으면 null' },
            order: { type: 'integer', description: '수행 순서, 1부터 시작' },
          },
          required: ['title', 'targetMinutes', 'order'],
        },
      },
    },
    required: ['quests'],
  },
};

function buildUserPrompt(tasks, deadlineTasks) {
  let text = `오늘 할 일:\n${tasks}\n`;
  if (deadlineTasks && deadlineTasks.length > 0) {
    text += '\n마감이 있는 태스크:\n';
    for (const t of deadlineTasks) {
      text += `- ${t.description} (마감: ${t.deadline})\n`;
    }
  }
  return text;
}

export async function decomposeQuests({ tasks, deadlineTasks }) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: [QUEST_TOOL],
    tool_choice: { type: 'tool', name: 'emit_quests' },
    messages: [{ role: 'user', content: buildUserPrompt(tasks, deadlineTasks) }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('LLM이 퀘스트를 생성하지 못했습니다');
  }
  return toolUse.input.quests;
}
