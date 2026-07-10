import { GoogleGenAI, Type } from '@google/genai';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// 'gemini-flash-latest'는 계속 "high demand" 503으로 실패해서(실측: 여러 번
// 재현됨) 'gemini-flash-lite-latest'로 교체. lite 계열이라 더 빠르고
// 안정적으로 응답하면서, 우리 스키마 기준 품질도 문제없음을 확인함
const MODEL = 'gemini-flash-lite-latest';

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
      // 출력 상한을 걸어서 불필요하게 긴 생성으로 지연시간이 늘어나는 걸 방지.
      // 체크리스트는 원래 짧은 출력이라 이 정도로도 안 잘림
      maxOutputTokens: 1200,
    },
  });

  const parsed = JSON.parse(response.text);
  return parsed.items;
}

// ---- 마감 태스크 → 캘린더 이벤트 이름 + 로드맵 ----

const ROADMAP_SYSTEM_PROMPT = `당신은 ADHD가 있는 개발자가 마감이 있는 태스크를 놓치지 않도록 돕는 보조 도구입니다.
사용자가 마감이 있는 태스크의 이름(title)과, 있다면 그 태스크에 대한 설명(details), 마감 시각을 알려주면:
1. 캘린더에 등록할 짧고 명확한 이벤트 이름(eventName)을 만들어주세요. 보통 title을 그대로 쓰거나 다듬으면 됩니다.
2. 지금부터 마감까지, 이 태스크를 끝내기 위해 거쳐야 할 중간 단계들을 로드맵(roadmap)으로 만들어주세요. 각 단계에는 그 단계를 마쳐야 하는 제안 날짜/시각(suggestedDate, ISO 8601 형식)을 붙이세요. 마감 시각을 절대 넘기지 않도록 역산해서 배치하세요.
3. 로드맵 단계는 3~6개 정도로, 너무 잘게 쪼개지 마세요 (세부 작업 분해는 별도 기능에서 합니다).
4. title이 "몰입캠프 2주차 과제", "발표 준비"처럼 실제로 무엇을 해야 하는지 알 수 없을 만큼 일반적이고, details도 비어있어서 로드맵을 구체적으로 만들기 어려운 경우: needsMoreInfo를 true로 설정하고, 그래도 가장 무난하게 적용될 법한 범용 로드맵(자료조사→초안→피드백→마무리 같은)을 만들어주세요.
5. title이나 details에서 실제로 무엇을 하는 태스크인지 알 수 있다면 needsMoreInfo는 false로 설정하세요.`;

const ROADMAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    eventName: { type: Type.STRING, description: '캘린더에 표시할 짧은 이벤트 이름' },
    needsMoreInfo: {
      type: Type.BOOLEAN,
      description: '태스크 이름/설명만으로는 정보가 부족해서, 설명을 추가하면 로드맵이 더 정확해질 수 있는 경우 true',
    },
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
  required: ['eventName', 'needsMoreInfo', 'roadmap'],
};

// deadline(datetime-local, 타임존 표기 없는 로컬시간 문자열)과 형식을 맞춘
// "지금" 문자열을 만든다. 예전엔 new Date().toISOString()(UTC, 'Z' 붙음)을
// 그대로 넣었는데, 타임존 표기가 있는 값과 없는 값을 한 프롬프트에 같이
// 넣으면 LLM이 시차만큼 날짜 계산을 잘못해서(마감을 하루 넘기는 등) 실제로
// 재현됨 — 같은 "타임존 없는 로컬시간" 형식으로 통일해서 이 문제를 줄인다.
function toNaiveLocalString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function generateDeadlineRoadmap({ title, details, deadline }) {
  const taskInfo = details && details.trim()
    ? `태스크 이름: ${title}\n태스크 설명: ${details}`
    : `태스크 이름: ${title}\n태스크 설명: (없음)`;

  const response = await genAI.models.generateContent({
    model: MODEL,
    contents: `${taskInfo}\n마감 시각: ${deadline}\n현재 시각: ${toNaiveLocalString(new Date())}`,
    config: {
      systemInstruction: ROADMAP_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: ROADMAP_SCHEMA,
      maxOutputTokens: 800,
    },
  });

  const result = JSON.parse(response.text);

  // LLM이 프롬프트 지시를 놓쳐서 마감을 넘기는 단계를 만드는 경우에 대비한
  // 안전장치 — 마감 이후로 잡힌 단계는 마감 시각으로 강제 클램핑한다.
  const deadlineDate = new Date(deadline);
  if (!Number.isNaN(deadlineDate.getTime())) {
    result.roadmap = result.roadmap.map((step) => {
      const stepDate = new Date(step.suggestedDate);
      if (!Number.isNaN(stepDate.getTime()) && stepDate.getTime() > deadlineDate.getTime()) {
        return { ...step, suggestedDate: deadline };
      }
      return step;
    });
  }

  return result;
}
