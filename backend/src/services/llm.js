import { GoogleGenAI, Type } from '@google/genai';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// 'gemini-flash-latest'는 계속 "high demand" 503으로 실패해서(실측: 여러 번
// 재현됨) 'gemini-flash-lite-latest'로 교체. lite 계열이라 더 빠르고
// 안정적으로 응답하면서, 우리 스키마 기준 품질도 문제없음을 확인함
const MODEL = 'gemini-flash-lite-latest';

// ---- 오늘 할 일 → 휴식 포함 계획 (대화형) ----
// 사용자가 단어 위주로 짧게 적으면 LLM이 과도하게 확대해석해서 엉뚱한 세부
// 작업을 지어내는 문제가 있었다. 한 번에 계획을 뽑지 않고, 정보가 부족하면
// 되물어서 확인한 뒤에만 계획을 만들도록 대화형으로 바꿨다.

const PLAN_CHAT_SYSTEM_PROMPT = `당신은 ADHD가 있는 개발자가 오늘 할 일을 실행 가능한 계획으로 만들도록 대화로 돕는 보조 도구입니다. 당신의 이름은 John입니다.

대화 방식:
- 질문은 항상 사용자가 방금 한 말에 이어서 하세요. 미리 정해둔 것 같은 뻔하고 일반적인 문장(예: "각각 몇 시에 시작해서 얼마나 걸릴 것 같아요?" 같은 정형화된 템플릿 문구)을 그대로 반복하지 마세요. 사용자가 실제로 언급한 작업 이름이나 단어를 질문 문장 안에 직접 넣어서, 지금 나눈 대화와 자연스럽게 이어지는 것처럼 매번 새로 구성하세요.
- 사용자가 오늘 할 일을 짧은 단어 위주로 대충 적으면("코딩, 회의" 같은), 그 상태로 계획을 만들면 사용자가 말하지 않은 세부 작업을 지어내게 됩니다. 이럴 때는 계획을 만들지 말고 needsClarification을 true로 설정하고, 사용자가 말한 단어를 그대로 짚어서 가장 중요한 것 한 가지만 짧게 되물으세요 (예: 사용자가 "코딩"이라고만 했다면 "코딩이라고 하신 건 구체적으로 어떤 기능이나 문제를 다루는 거예요?"처럼).
- 무엇을 할지 알게 됐다면, 각 작업을 몇 시에 시작할 것인지(startTime)와 사용자가 생각하기에 얼마나 걸릴 것 같은지(targetMinutes)를 반드시 확인하세요. 시간표를 정확하게 만들려면 이 정보가 꼭 필요합니다. 없다면 needsClarification을 true로 설정하고, 사용자가 방금 말한 작업 이름을 문장에 직접 넣어서 물으세요 (예: 사용자가 "로그인 리팩토링이랑 회의"라고 답했다면 "로그인 리팩토링이랑 회의, 각각 몇 시에 시작하실 예정이에요?"처럼 그 둘을 콕 집어서). 사용자가 말한 예상 소요 시간은 임의로 부풀리지 말고 그대로 존중해서 쓰세요.
- 하루 일과를 몇 시에 마무리하고 싶은지(dayEndTime)도 한 번은 확인하세요. 이미 답을 들었다면 다시 묻지 마세요.
- 질문은 한 번에 한 가지만, 팩트 기반으로, 판단하거나 다그치는 말투 없이 하세요.
- 최대 두 번까지만 되물을 수 있습니다. 그 이후에는 있는 정보로 최선을 다해 계획을 만드세요 (시작 시간을 못 들은 항목은 바로 앞 항목이 끝나는 시간에 이어 붙이세요).

계획(items)을 만들 때 규칙:
- 하나의 작업(task) 항목은 5~30분 안에 끝낼 수 있는 크기여야 합니다. 막연하고 큰 작업("리팩토링하기")은 반드시 더 작은 단위로 쪼개세요.
- targetMinutes는 사용자가 말한 예상 소요 시간을 우선 쓰세요. 사용자가 전혀 감을 못 잡는 경우에만 ADHD의 시간 감각 왜곡을 고려해 약간 여유 있게 추정하세요.
- startTime은 "HH:MM" 24시간제로, 각 항목이 실제로 시작하는 시각을 적으세요. 항목들이 시간 순서대로 이어지도록 배치하세요.
- 시각에 오전/오후(또는 새벽, 밤 등)가 명시되지 않은 경우: 업무 중간의 작업 시작 시각(startTime)은 문맥상 자연스러운 시간대(보통 오전~오후)로 해석하고, 하루 마무리 시각(dayEndTime)은 특별한 언급이 없는 한 항상 오후/저녁으로 해석하세요 (예: "5시에 마무리"는 17:00, "9시에 마무리"는 21:00 — 하루를 새벽에 마무리한다고 말하는 사용자는 거의 없습니다).
- 작업(task) 사이사이에 짧은 휴식(break) 항목을 반드시 끼워 넣으세요. 대략 25~45분 작업마다 5~10분 휴식을 배치합니다.
- 제목은 "무엇을 할지"가 명확하게 드러나는 짧은 동사구로 쓰세요. 휴식 항목은 사용자가 직접 입력할 수 있도록 생략해주세요.
- 판단하거나 훈계하는 말투를 쓰지 마세요.

needsClarification이 true면 question을 채우고 items는 빈 배열로, dayEndTime은 빈 문자열로 두세요.
needsClarification이 false면 question은 빈 문자열로 두고 items(각 항목의 startTime 포함)를 채우고, dayEndTime을 알고 있다면 채우세요(모르면 빈 문자열).`;

const PLAN_CHAT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    needsClarification: { type: Type.BOOLEAN, description: '계획을 만들기 전에 한 가지만 더 물어봐야 하면 true' },
    question: { type: Type.STRING, description: 'needsClarification이 true일 때 물어볼 짧은 질문 한 가지. false면 빈 문자열' },
    items: {
      type: Type.ARRAY,
      description: 'needsClarification이 false일 때 최종 계획. true면 빈 배열',
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ['task', 'break'] },
          title: { type: Type.STRING, description: '항목 제목, 구체적이고 짧게' },
          startTime: { type: Type.STRING, description: '이 항목이 시작하는 시각, "HH:MM" 24시간제' },
          targetMinutes: { type: Type.INTEGER, description: '예상 소요 시간(분)' },
          order: { type: Type.INTEGER, description: '수행 순서, 1부터 시작' },
        },
        required: ['type', 'title', 'startTime', 'targetMinutes', 'order'],
      },
    },
    dayEndTime: { type: Type.STRING, description: '사용자가 원하는 하루 마무리 시각, "HH:MM" 24시간제. 모르면 빈 문자열' },
  },
  required: ['needsClarification', 'question', 'items', 'dayEndTime'],
};

// 클라이언트가 이미 두 번 되물은 뒤 세 번째 메시지를 보낼 때 true로 전달한다.
// 시스템 프롬프트에도 "최대 두 번"이라 적혀 있지만, 모델이 지시를 놓쳐 계속
// 되묻는 경우에 대비한 안전장치로 프롬프트에 강제 지시를 덧붙인다.
const FORCE_FINALIZE_NOTE = '\n\n지금은 이미 두 번 되물은 상태입니다. 더 이상 질문하지 말고, 지금까지 들은 정보로 최선을 다해 반드시 계획을 완성하세요. needsClarification은 false로 설정하세요.';

function parseTimeToMinutes(time) {
  if (!time || typeof time !== 'string') return null;
  const m = /^([0-2]?\d):([0-5]\d)$/.exec(time.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(m[2]);
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 모델이 지시를 놓쳐서 일부 항목의 startTime을 비워 보내는 경우에 대비한
// 안전장치 — 없는 항목은 바로 앞 항목이 끝나는 시각에 이어 붙이고, 첫 항목도
// 없으면 지금 시각부터 시작하는 것으로 채운다. 이게 없으면 시간표(DayWheel)가
// 아무것도 그리지 못하는 채로 대화가 끝나버린다.
function backfillStartTimes(items) {
  const now = new Date();
  let cursorMinutes = now.getHours() * 60 + now.getMinutes();

  return items.map((it) => {
    const parsedStart = parseTimeToMinutes(it.startTime);
    const startMinutes = parsedStart !== null ? parsedStart : cursorMinutes;
    const duration = Number.isFinite(it.targetMinutes) ? it.targetMinutes : 0;
    cursorMinutes = startMinutes + duration;
    return { ...it, startTime: minutesToTime(startMinutes) };
  });
}

export async function generateDailyPlanChat({ messages, forceFinalize }) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  const response = await genAI.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: PLAN_CHAT_SYSTEM_PROMPT + (forceFinalize ? FORCE_FINALIZE_NOTE : ''),
      responseMimeType: 'application/json',
      responseSchema: PLAN_CHAT_SCHEMA,
      maxOutputTokens: 1200,
    },
  });

  const parsed = JSON.parse(response.text);

  if (!parsed.needsClarification) {
    // 모델이 "완료"라고 했는데 항목이 비어있는 경우가 실제로 관측됨 — 이대로
    // 넘기면 프론트가 빈 계획에 갇혀서 대화가 멈춰버리므로, 한 번 더
    // 구체적으로 물어보게 만든다.
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return {
        done: false,
        question: '오늘 하려는 일을 아직 충분히 파악하지 못했어요. 조금 더 구체적으로 다시 말씀해주시겠어요?',
      };
    }
    return { done: true, items: backfillStartTimes(parsed.items), dayEndTime: parsed.dayEndTime || null };
  }
  return { done: false, question: parsed.question };
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
