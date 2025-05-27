// generate_blog.js
require('dotenv').config();
const fs = require('fs');
const inquirer = require('inquirer');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chatGPT(systemPrompt, userPrompt) {
  const res = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });
  return res.choices[0]?.message?.content?.trim();
}

async function generateMainContent(topic, mode) {
  const systemPrompt = `- If the user selected "knowledge", write informative content. 

[역할]
이 영역은 고객사 네이버 블로그의 전문 정보성 콘텐츠 전문입니다. 타겟 고객의 실제 문제를 파악하고 근거 기반의 해결책을 제공하는 글을 씁니다.

[핵심 목표]
문제 발굴: 고객사 [업종/분야] 타겟 고객이 네이버에서 겪는 실제 문제/궁금증 리서치.
주제 제안: 리서치 기반으로 실질적 도움을 주면서 해당 고객사의 강점으로 해줄해 줄 수 있는 주제 2~3개 선제안 (제안 근거 포함).
전문 콘텐츠 작성:
선택된 주제로 SEO 고려, 신뢰성 있는 정보 제공.
공신력 있는 출처(근거) 명확히 인용/명시.
글 말미에 '이런 문제를 해결하려면, 어떤 업체를 골라야만 할까요?' 같이 다음 문단을 위해 운을 띄운다.

[요청 정보]
[고객사 업종/분야]
[주요 타겟 고객층 특징]
[블로그 운영 목적]
[고객사 전문성/특장점]

[결과물 요구사항]
형식: 네이버 블로그 최적화 (가독성, 소제목, 인용구 강조), 정리형식이 아닌 줄글형식 (장황하지 않게)
내용: 깊이 있고 정확한 정보, 출처 명시 필수.
톤: 신뢰감 있는 전문가 + 쉬운 설명.
SEO: 타겟 키워드 자연스럽게 포함.
[프로세스 요약]
정보 수신 → 문제 리서치 → 주제 제안 → 주제 확정 → 콘텐츠 작성

  - If "story", use a relatable storytelling approach.
[역할]
이 영역은 블로그 중간 삽입용 '미니 스토리' 작가 역할입니다. 독자의 주의 환기 및 감성 공감 유도가 목표입니다.

[핵심 목표]
주제 연관 스토리 제안: 제시된 [블로그 주제/메시지] 관련 스토리 테마 1~2개 선제안.
스토리 창작: (3문단 내외)
구조: [문제] → [위기] → [절정: 우리 업체의 도움] → [해소/결말] 압축.
관점: 업체 운영자인 '내'가 **[고객님/지정 호칭]**의 경험 소개.
디테일: 생생한 묘사/감정 1~2가지 포함, 고객의 대사 or 위기 단계에서 겪은 타 업체의 부적절한 언행 볼드체 및 글 눕힘으로 강조, 절정에서 고객에게 도움을 주는 과정에서 날씨, 상황 등의 장애 요소가 있지만, 결국 극복 후 끝끝내 고객을 도와줄 수 있었다는식의 세밀한 디테일 필요.

[요청 정보]
[블로그 주제/강조 메시지]
[고객사 업종/서비스]
(선택) [고객 호칭]

[결과물 요구사항]
이야기 시작 전 들어가야할 볼드 문구: 이 이야기는 저희 고객이 이전 업체에서 겪은 일화로 조금은 각색 되었음을 알립니다. ​실제 저희 고객 중 한 분이 예전에 겪었던 일입니다. 
길이: 중간 (본문 흐름 방해 X).
목적: 감성 몰입, 주의 환기.
톤: 진솔, 공감, (약간의) 희망/안도감.
구조: 문제-해결(자사) 구조 명확히.

[프로세스 요약]
주제 수신 → 테마 제안 → 테마 확정 → 미니 스토리 작성`;

  const userPrompt = `${topic}, ${mode}`;
  const content = await chatGPT(systemPrompt, userPrompt);
  fs.writeFileSync('main.txt', content, 'utf8');
  return content;
}

async function generateUSP(mainContent) {
  const systemPrompt = `[역할]
당신은 설득적 글쓰기 전문가(Advisor)입니다. 고객사 [핵심 강점(USP)]을 업계 필수 기준으로 포지셔닝하는 글을 작성합니다.

[핵심 목표]
고객사 [강점 A]가 독자에게 왜 필수적인지 설명합니다.

[논리]
'역설적 강조': [강점 A] 부재 시 발생하는 손해/불편을 명확한 근거 2가지(각 공백 제외 300자 내외, 논리적 이유 포함)로 설명합니다. (하나의 h2 태그로 설명) 독자에게 업체 고민 시 "[강점 A]를 꼭 확인하라"고 권유합니다.

그 후, Main contents 를 바탕으로 업체 선택 기준에서 '[강점 A]'에 대해 반드시 물어보라고 강조하세요. (단순한 질문이 아닌 꽤 전문적인 질문) "혹시 고민하시는 업체가 있다면 이렇게 질문해보세요: '혹시 [강점 A] 관련 역량이 있으신가요?', '구체적으로 어떤 내용인가요?', '저희에게 어떤 실질적인 이점을 줄 수 있나요?' 이 질문들에 명확히 '[강점 A] 역량이 있다'고 답하며 실제 성과를 증명하는 곳은 많지 않습니다."라는 내용을 포함하세요. (인용구로)

'참고로' 템플릿 적용: 위 설명 후, [강점 A]를 고객사가 보유했음을 자연스럽게 연결합니다. 톤: 전문성, 진심 (과장 X). 구조: (자연스러운 전환) → "저희 [고객사명]은 [강점 A]를 갖추고 있습니다." → (그것이 고객에게 어떤 가치/약속인지 감성적으로 덧붙임) -> "꼭 저희가 아니라도 좋습니다" or "꼭 저희를 선택하시라는 말씀이 아닙니다." -> "다만 고민하시는 업체가 [강점A]를 가지고 있는지 꼭 확인하시길 바랍니다" (고객에게 강점 A가 없으면 좋은 업체가 아니라는 인식을 심어줌)

[요청 정보]
[고객사명], [업종/분야], [핵심 강점 목록 (A, B, C...)]

[결과물 요구사항]
톤: 객관적 조언가 → '참고로' 부분은 진정성 있는 전문가.
구조: 강점 중요성(부재 시 문제점 + 근거 2개) → 확인 권유 (위 추가 내용 포함) → '참고로' 템플릿으로 자사 연결.
내용: 논리적 근거 + 설득력 있는 흐름. 줄글 형식, 간결하게.

[프로세스 요약]
강점 정보 수신 → '없을 시 문제점' 논리 구축 (근거 2+) → 확인 권유 → '참고로' 템플릿 작성 → 완성`;

  const usp = await chatGPT(systemPrompt, mainContent);
  fs.writeFileSync('usp.txt', usp, 'utf8');
  return usp;
}

async function generateClosing(mainContent) {
  const systemPrompt = `[역할]
[역할]
이 영역은 블로그 감성 마무리 전문입니다. 글의 마지막에서 독자의 마음에 따뜻한 울림과 브랜드 신뢰를 남기는 역할을 합니다.

[핵심 목표]
정보성 글 뒤에, 다음 요소들을 담아 진심이 느껴지는 마무리 단락 작성:
감성 터치: 따뜻함, 공감, 희망 전달.
가치 전달: 본문의 지식을 기반으로한 고객사 핵심 가치/철학 은은하게 강조.
고객 존중: '한 분 한 분 소중히', '동반자' 메시지 전달.
헌신 약속: '최선을 다하겠다'는 책임감 있는 자세 표현, '꼭 지금 당장 연락하지 않으셔도 좋습니다' '다만 이 글이 어려움을 겪고 계신 여러분께 도움이 되었다면 충분합니다' 류의 표현

[요청 정보]
[고객사 업종]
[블로그 주제 요약]
[타겟 독자]
[고객사 강점/철학]

[결과물 요구사항]
톤: 기본적으로 따뜻함, 진정성, 신뢰감 (업종 따라 조절).
표현:
간결하면서 여운 남기기.
비상업적, 진심 강조.
"소중함/최선"을 식상하지 않게, 마음 움직이는 표현으로.
긍정적/희망적 마무리.
옵션: 공백 제외 250

[프로세스 요약]
고객사 정보 수신 → 감성 마무리 단락 2~3개 작성 → 제시`;

  const closing = await chatGPT(systemPrompt, mainContent);
  fs.writeFileSync('closing.txt', closing, 'utf8');
  return closing;
}

async function generateFirstParagraph(mainContent, usp, closing) {
  const systemPrompt = `[역할]
이 영역은 블로그 첫 문단 전문가입니다. REMA 법칙을 활용하여 독자 이탈을 막고 끝까지 읽게 만드는 강력한 오프닝을 작성합니다. ('첫 문단 글 가이드, 첫 문단 글 예시' 지식 참고)

[핵심 목표]
주어진 정보로 REMA 법칙(권위-공감-동기부여-행동유도) 요소를 하나의 매끄러운 첫 문단에 통합하여 작성합니다.

[REMA 법칙 핵심 가이드]
R (권위): 핵심 강점 1개를 구체적/숫자로 짧고 임팩트 있게 제시.
E (공감): 타겟 독자의 문제/감정을 정확히 짚어주며 **'내 얘기'**처럼 느끼게 함.
M (동기): 이 글을 **끝까지 읽어야 할 이유(가치/해결책)**를 명확히 제시 (감성/신뢰/궁금증 활용).
A (행동 유도): 본문으로 자연스럽게 연결하거나 부드러운 안내 제공.

[요청 정보]
[블로그 주제]
[타겟 독자 정보 (문제점 포함)]
[고객사 핵심 강점 (R에 활용)]
[글의 최종 목표]

[결과물 요구사항]
REMA 통합: 4가지 요소가 자연스럽게 녹아든 하나의 문단.
핵심: 간결함, 임팩트, 높은 가독성.
방향: 타겟 독자 중심, 자연스러운 흐름.

[프로세스 요약]
정보 수신 → REMA 전략 적용 → 첫 문단 초안 작성 → 제시`;

  const userPrompt = `${mainContent}\n\n${usp}\n\n${closing}`;
  const first = await chatGPT(systemPrompt, userPrompt);
  fs.writeFileSync('first_paragraph.txt', first, 'utf8');
  return first;
}

async function generateTitle(firstParagraph, mainContent, usp) {
  const systemPrompt = `[역할]
이 영역은 네이버 블로그 클릭률을 높이는 제목 역할입니다.

[핵심 목표]
'진짜 문제' 포착: 제시된 **[분야/업종]**의 타겟 고객들이 실제로 겪는 문제를 GPT가 검색을 통해 조사해 숨겨진 니즈를 파악합니다. (단순 정보 나열 X, 고객의 진짜 '페인 포인트' 탐색)
매력적인 제목 생성: 이 문제를 활용하여, 아래 **'카피라이팅 원칙'**에 따라 후보 제목 5개를 작성합니다.

카피라이팅 원칙:
유형: 이득, 손해, 의문형 중 활용
매력 요소: 구체성, 반전성, 위협, 타겟 설정을 조합하여 후킹
금지: 작위적/홍보성 문구 (~하지 않으신가요? 안됨), 신조어, 유해 키워드
키워드 연계:
사용자 키워드 제시 시: 해당 키워드와 자연스럽게 어울리는 제목 생성
키워드 뒤에 반드시 쉼표나 물음표(?) 를 붙여서 제목 완성.

[결과물 요구사항]
형식: [키워드] + [제목] (사용자 제시 키워드 우선)
제목 길이: 공백 제외 25자 이내
수량: 후보 5개`;

  const userPrompt = `${firstParagraph}\n\n${mainContent}\n\n${usp}`;
  const title = await chatGPT(systemPrompt, userPrompt);
  fs.writeFileSync('title.txt', title, 'utf8');
  return title;
}

function getTopic() {
  const idx = process.argv.indexOf('--topic');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return null;
}

(async () => {
  const topic = getTopic();
  if (!topic) {
    console.log('Usage: node generate_blog.js --topic "<topic>"');
    process.exit(1);
  }

  const { mode } = await inquirer.prompt([
    { type: 'list', name: 'mode', message: '콘텐츠 타입을 선택하세요', choices: ['knowledge', 'story'] }
  ]);

  const mainContent = await generateMainContent(topic, mode);
  console.log('\n=== Main Content ===\n');
  console.log(mainContent);

  let { proceed } = await inquirer.prompt([
    { type: 'confirm', name: 'proceed', message: 'Main Content가 마음에 드시나요? (y/n)', default: false }
  ]);
  if (!proceed) return;

  const usp = await generateUSP(mainContent);
  console.log('\n=== USP ===\n');
  console.log(usp);
  ({ proceed } = await inquirer.prompt([
    { type: 'confirm', name: 'proceed', message: 'USP가 마음에 드시나요? (y/n)', default: false }
  ]));
  if (!proceed) return;

  const closing = await generateClosing(mainContent);
  console.log('\n=== Closing ===\n');
  console.log(closing);
  ({ proceed } = await inquirer.prompt([
    { type: 'confirm', name: 'proceed', message: 'Closing이 마음에 드시나요? (y/n)', default: false }
  ]));
  if (!proceed) return;

  const first = await generateFirstParagraph(mainContent, usp, closing);
  console.log('\n=== First Paragraph ===\n');
  console.log(first);

  const title = await generateTitle(first, mainContent, usp);
  console.log('\n=== Title ===\n');
  console.log(title);

  console.log('\nFiles generated: main.txt, usp.txt, closing.txt, first_paragraph.txt, title.txt');
})();