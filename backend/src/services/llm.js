import { GoogleGenAI, Type } from '@google/genai';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// 'gemini-flash-latest'는 Google이 관리하는 별칭이라, 특정 버전이 나중에
// deprecated 되어도 코드를 안 고쳐도 최신 flash 모델을 계속 가리킴
const MODEL = 'gemini-flash-latest';

// ---- 오늘 할 일 → 휴식 포함 계획 ----

const PLAN_SYSTEM_PROMPT = `당신은 ADHD가 있는 개발자의 하루 계획을 돕는 보조 도구입니다.
사용자가 말한 "오늘 할 일"을 받아서, 실행 가능한 작은 항목들의 계획으로 쪼갭니다.

규칙:
- 하나의 작업(task) 항목은 5~30분 안에 끝낼 수 있는 크기여야 합니다. 막연하고 큰 작업("리팩토링하기")은 반드시 더 작은 단위로 쪼개세요.
- targetMinutes는 낙관적으로 잡지 말고, ADHD의 시간 감각 왜곡을 고려해 약간 여유 있게 잡으세요.
- 작업(task) 사이사이에 짧은 휴식(break) 항목을 반드시 끼워 넣으세요. 대략 25~45분 작업마다 5~10분 휴식을 배치합니다.
- 제목은 "무엇을 할지"가 명확하게 드러나는 짧은 동사구로 쓰세요. 휴식 항목도 "잠깐 스트레칭" 처럼 구체적으로 쓰세요.
- 판단하거나 훈계하는 말투를 쓰지 마세요. 그냥 실행 가능한 항목만 나열하세요.`;

const PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ['task', 'break'] },
          title: { type: Type.STRING, description: '항목 제목, 구체적이고 짧게' },
          targetMinutes: { type: Type.INTEGER, description: '예상 소요 시간(분)' },
          order: { type: Type.INTEGER, description: '수행 순서, 1부터 시작' },
        },
        required: ['type', 'title', 'targetMinutes', 'order'],
      },
    },
  },
  required: ['items'],
};

export async function generateDailyPlan({ tasks }) {
  const response = await genAI.models.generateContent({
    model: MODEL,
    contents: `오늘 할 일:\n${tasks}`,
    config: {
      systemInstruction: PLAN_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: PLAN_SCHEMA,
    },
  });

  const parsed = JSON.parse(response.text);
  return parsed.items;
}

// ---- 마감 태스크 → 캘린더 이벤트 이름 + 로드맵 ----

const ROADMAP_SYSTEM_PROMPT = `당신은 ADHD가 있는 개발자가 마감이 있는 태스크를 놓치지 않도록 돕는 보조 도구입니다.
사용자가 마감이 있는 태스크 설명과 마감 시각을 알려주면:
1. 캘린더에 등록할 짧고 명확한 이벤트 이름(eventName)을 만들어주세요.
2. 지금부터 마감까지, 이 태스크를 끝내기 위해 거쳐야 할 중간 단계들을 로드맵(roadmap)으로 만들어주세요. 각 단계에는 그 단계를 마쳐야 하는 제안 날짜/시각(suggestedDate, ISO 8601 형식)을 붙이세요. 마감 시각을 절대 넘기지 않도록 역산해서 배치하세요.
3. 로드맵 단계는 3~6개 정도로, 너무 잘게 쪼개지 마세요 (세부 작업 분해는 별도 기능에서 합니다).`;

const ROADMAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    eventName: { type: Type.STRING, description: '캘린더에 표시할 짧은 이벤트 이름' },
    roadmap: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          suggestedDate: { type: Type.STRING, description: 'ISO 8601 형식의 제안 날짜/시각' },
          order: { type: Type.INTEGER },
        },
        required: ['title', 'suggestedDate', 'order'],
      },
    },
  },
  required: ['eventName', 'roadmap'],
};

export async function generateDeadlineRoadmap({ description, deadline }) {
  const response = await genAI.models.generateContent({
    model: MODEL,
    contents: `태스크: ${description}\n마감 시각: ${deadline}\n현재 시각: ${new Date().toISOString()}`,
    config: {
      systemInstruction: ROADMAP_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: ROADMAP_SCHEMA,
    },
  });

  return JSON.parse(response.text);
}
