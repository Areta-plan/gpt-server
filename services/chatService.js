// services/chatService.js
const fs = require('fs');
const path = require('path');
// 시스템 프롬프트 (이전 prompts.js에서 이동)
const SYSTEM_PROMPT = `당신은 특허법무법인에서 일하는 전문적이면서도 친근한 상담사입니다.

핵심 역할:
- 특허, 상표, 디자인 등 지식재산권 관련 전문 상담
- 복잡한 법적 내용을 쉽고 이해하기 쉽게 설명
- 실무적이고 구체적인 조언 제공
- 고객의 비즈니스 상황을 고려한 맞춤형 답변

말투와 태도:
- 전문적이지만 딱딱하지 않게
- 친근하고 따뜻한 톤
- 고객의 입장에서 생각하며 공감
- 불안감을 해소하고 신뢰감을 주는 설명

답변 구조:
1. 핵심 답변 (간단명료)
2. 상세 설명 (필요시)
3. 실무적 조언
4. 추가 고려사항 (있다면)

주의사항:
- 확실하지 않은 법적 판단은 피하고 "상세한 검토가 필요합니다" 안내
- 개별 사안의 특성을 강조
- 전문가 상담의 필요성 적절히 언급`;
const { getTopKChunksByCategory, getTopKChunks } = require('../vectorStore');
const { webSearch } = require('./webSearch');
const { getOpenAIClient } = require('../lib/openaiClient');

// 최신 파인튜닝 모델 ID 읽기 (자동 학습 후 latest_model.txt에 저장)
function getLatestModel() {
  try {
    const content = fs.readFileSync(path.resolve(__dirname, '../latest_model.txt'), 'utf8').trim();
    
    // 파일 내용이 job ID 형태라면 기본 모델 사용
    if (!content || content.includes('Job ftjob-') || content.startsWith('#')) {
      return 'gpt-4o-mini';
    }
    
    // 실제 모델 ID인 경우
    return content;
  } catch (error) {
    return 'gpt-4o-mini';
  }
}

/**
 * 단순 메시지 처리: /ask 엔드포인트용
 */
async function handleChatRequest(userMessage) {
  try {
    const openai = getOpenAIClient();
    const model = getLatestModel();
    
    // 1) 임베딩 생성
    const { data } = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: userMessage
    });
    const embedding = data[0].embedding;

  // 2) RAG 청크 추출
  const chunks = getTopKChunks(embedding, 3);
  console.log('---- RAG Debug (/ask) ----');
  console.log('User Message:', userMessage);
  console.log('Retrieved Chunks:', chunks);
  console.log('-------------------------');
  const knowledgeContext = chunks.join('\n\n');

  // 3) GPT 호출
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: '[Knowledge]\n' + knowledgeContext },
    { role: 'user',   content: userMessage }
  ];
  console.log('Final Messages (/ask):', messages);
    const resp = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      top_p: 0.9,
      frequency_penalty: 0.7,
      max_tokens: 1800
    });
    return resp.choices[0].message.content;
  } catch (err) {
    console.error('[/ask] OpenAI call failed:', err.response?.data || err.message);
    
    if (err.code === 'insufficient_quota') {
      throw new Error('OpenAI API 할당량이 부족합니다. 계정을 확인해주세요.');
    } else if (err.code === 'rate_limit_exceeded') {
      throw new Error('API 호출 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
    }
    throw new Error('OpenAI 응답 생성 중 오류가 발생했습니다.');
  }
}

/**
 * 대화 히스토리 처리: /chat 엔드포인트용
 */
async function handleChatHistoryRequest(messages, references = []) {
  try {
    const openai = getOpenAIClient();
    const model = getLatestModel();
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) throw new Error('사용자 메시지가 필요합니다.');

    const { data } = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: lastUser.content
    });
    const embedding = data[0].embedding;

  const chunks = getTopKChunks(embedding, 3);
  const knowledgeContext = chunks.join('\n\n');

  const finalMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: '[Knowledge]\n' + knowledgeContext },
    ...messages
  ];

  if (references.length > 0) {
    console.log('[chatService] uploaded references:', references.map(f => f.originalname));
  }

    console.log('Final Messages (/chat):', finalMessages);
    const resp = await openai.chat.completions.create({
      model,
      messages: finalMessages,
      temperature: 0.3,
      top_p: 0.9,
      frequency_penalty: 0.7,
      max_tokens: 1800
    });
    return resp.choices[0].message.content;
  } catch (err) {
    console.error('[/chat] OpenAI call failed:', err.response?.data || err.message);
    
    if (err.code === 'insufficient_quota') {
      throw new Error('OpenAI API 할당량이 부족합니다. 계정을 확인해주세요.');
    } else if (err.code === 'rate_limit_exceeded') {
      throw new Error('API 호출 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
    }
    throw new Error('대화 응답 생성 중 오류가 발생했습니다.');
  }
}

/**
 * 블로그 초안 생성: /blog 엔드포인트용
 */
async function handleBlogRequest({ topic, mode, userParams }) {
  try {
    const openai = getOpenAIClient();
    const model = getLatestModel();

    // 1) 웹 검색
    const results = await webSearch(`${topic} 최신 트렌드`, 3);
    const searchContext = results
      .map((r, i) => `${i+1}. ${r.title}\n${r.snippet}\n(${r.link})`)
      .join('\n\n');

    // 2) 주제 임베딩
    const qEmb = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: topic
    });
    const emb = qEmb.data[0].embedding;

  // 3) 모듈별 RAG 컨텍스트
  const titlesCtx   = getTopKChunksByCategory(emb, 'titles', 3);
  const introCtx    = getTopKChunksByCategory(emb, 'intro', 3);
  const mainKey     = mode === 'story' ? 'mainStory' : 'mainKnowledge';
  const mainCtx     = getTopKChunksByCategory(emb, mainKey, 3);
  const strengthCtx = getTopKChunksByCategory(emb, 'strength', 3);
  const closingCtx  = getTopKChunksByCategory(emb, 'closing', 3);

  // 4) 업로드된 파일 컨텍스트 추가
  let uploadedContext = '';
  if (userParams.uploadedFiles && userParams.uploadedFiles.length > 0) {
    uploadedContext = userParams.uploadedFiles
      .map(file => `[${file.filename}]\n${file.content}`)
      .join('\n\n---\n\n');
  }

  console.log('---- RAG Debug (/blog) ----');
  console.log('Topic:', topic, 'Mode:', mode);
  console.log('User Params:', {
    target: userParams.target,
    tone: userParams.tone,
    brand: userParams.brand,
    style: userParams.style,
    uploadedFileCount: userParams.uploadedFiles?.length || 0
  });
  console.log('Search Context:', searchContext);
  console.log('Uploaded Files Context:', uploadedContext ? '파일 업로드됨' : '파일 없음');
  console.log('Titles Context:', titlesCtx);
  console.log('Intro Context:', introCtx);
  console.log(`Main (${mode}) Context:`, mainCtx);
  console.log('Strength Context:', strengthCtx);
  console.log('Closing Context:', closingCtx);
  console.log('--------------------------');

  // 5) 시스템 프롬프트 조립
  let systemPrompt = `
${SYSTEM_PROMPT}

---
[사용자 요구사항]
- 대상 독자: ${userParams.target}
- 톤앤매너: ${userParams.tone}
- 브랜드: ${userParams.brand}
- 스타일: ${userParams.style}

[Web Search Results]
${searchContext}

1) [5 Compelling Titles 참고 자료]
${titlesCtx.join('\n\n')}

2) [First Paragraph 참고 자료]
${introCtx.join('\n\n')}

3) [Main Content (${mode}) 참고 자료]
${mainCtx.join('\n\n')}

4) [Brand Strength Highlight]
${strengthCtx.join('\n\n')}

5) [Emotional/Impactful Closing]
${closingCtx.join('\n\n')}`;

  // 업로드된 파일 내용 추가
  if (uploadedContext) {
    systemPrompt += `\n\n[업로드된 참고 자료]\n${uploadedContext}`;
  }

  systemPrompt += `\n\n위 자료들을 참고해서, 아래 구조로 ${userParams.target}을 대상으로 한 ${userParams.tone} 톤의 블로그 글을 작성하세요:
1. 5 Compelling Titles
2. First Paragraph
3. Main Content (${mode})
4. Brand Strength Highlight (${userParams.brand})
5. Emotional/Impactful Closing`;

    // 6) GPT 호출
    const resp = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `주제: ${topic}` }
      ],
      temperature: 0.25,
      top_p: 0.8,
      frequency_penalty: 0.7,
      max_tokens: 5000
    });
    return resp.choices[0].message.content;
  } catch (err) {
    console.error('[/blog] OpenAI call failed:', err.response?.data || err.message);
    
    if (err.code === 'insufficient_quota') {
      throw new Error('OpenAI API 할당량이 부족합니다. 계정을 확인해주세요.');
    } else if (err.code === 'rate_limit_exceeded') {
      throw new Error('API 호출 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
    }
    throw new Error('블로그 초안 생성 중 오류가 발생했습니다.');
  }
}

module.exports = { handleChatRequest, handleChatHistoryRequest, handleBlogRequest };
