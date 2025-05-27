# GPT Server 프로젝트 진행 상황 - Claude 메모리

## 프로젝트 개요
GPT 기반 블로그 생성 및 분류 시스템 + RLHF(Reinforcement Learning from Human Feedback) 통합

## 주요 구성 요소

### 1. 웹 인터페이스 (chatgpt-client/)
- **index.html**: 탭 기반 UI (일반채팅, 지식검색, 자동분류, 블로그생성)
- **script.js**: 핵심 클라이언트 로직
- **style.css**: 현대적 UI 스타일링

### 2. 서버 구조 (server.js + lib/ + routes/)
- **server.js**: Express 메인 서버, 블로그 추출 엔드포인트
- **lib/anthropicClient.js**: Claude API 클라이언트 (토큰 최적화됨)
- **lib/autoClassificationManager.js**: 자동 분류 관리 (토큰 최적화됨)
- **lib/rlhfManager.js**: RLHF 피드백 처리 및 성능 개선
- **lib/classificationPrompts.js**: 분류 프롬프트 (상세 유지됨)

### 3. 분류 시스템
- **카테고리**: title, firstparagraph, closing, story, usp
- **디렉토리 구조**:
  - `auto_classified/`: Claude 자동 분류 결과
  - `claude_approved/`: 승인된 분류 결과
  - `training_examples/`: Few-shot 학습 예시
  - `training_data/`: OpenAI 파인튜닝용 JSONL
  - `negative_training/`: RLHF 낮은 점수 데이터

## 최근 주요 개발 사항

### RLHF 시스템 구현
- **평가 인터페이스**: 별점 평가 + 개선사항 입력
- **로컬 저장소**: localStorage로 평가 상태 지속성
- **단계별 제출**:
  - "제안하기" → `completed: true` (파일 체크마크, 여전히 보임)
  - 최종 RLHF 제출 → `submitted: true` (파일 숨김)
- **개별 파일 리셋**: 🔄 버튼으로 특정 파일 평가 초기화

### 블로그 추출 시스템 **[현재 작업 중]**
- **Puppeteer 통합**: JavaScript 동적 렌더링 지원
- **네이버 블로그 특화**: 다중 URL 접근 + 모바일 버전 시도
- **7가지 추출 패턴**: 스마트에디터, 일반 블로그, 모바일 등
- **토큰 최적화**: 
  - 제목 200자, 마무리 500자, 첫문단 800자 제한
  - Few-shot 예시 2개로 제한
  - max_tokens 500, temperature 0.1
- **디버깅 로깅**: 단계별 텍스트 길이 추적

### UI/UX 개선사항
- **파일 상태 표시**:
  - ⏳ 평가 대기
  - ✅ 평가 완료 (🔄 리셋 가능)
  - (숨김) RLHF 제출 완료
- **평가 상태 복원**: 파일 재선택 시 기존 별점/개선사항 복원
- **자동 진행**: 제출 후 다음 파일로 자동 이동
- **스피닝 로딩 수정**: 텍스트가 함께 돌지 않도록 CSS 개선

### 성능 최적화
- **토큰 사용량 대폭 감소** (프롬프트 품질 유지)
- **크롤링 효율성 개선** (네이버 블로그 구조적 문제 해결)
- **실시간 분류** (중간 구조화 단계 생략)

## 현재 진행 중인 작업

### 블로그 추출 문제 해결
- **현상**: 네이버 블로그에서 "특허/상표/디자인"만 추출됨 (901자 → 9자)
- **원인**: 스마트에디터의 복잡한 HTML 구조, JavaScript 동적 로딩
- **해결책**: 
  1. ✅ Puppeteer 통합 완료 (설치됨)
  2. 🔄 동적 렌더링 후 텍스트 추출 구현 중
  3. ⚠️ syntax error 해결 필요 (server.js line 602)

### 기술적 도전과제
- **네이버 블로그 구조**: 테이블 기반 스마트에디터, JavaScript 렌더링
- **HTML 파싱 한계**: 정적 fetch로는 실제 콘텐츠 접근 불가
- **토큰 최적화**: 프롬프트 품질 유지하며 사용량 감소

## 현재 알려진 이슈

### 1. 서버 syntax error **[긴급]**
- **위치**: server.js line 602 `} catch (error) {`
- **원인**: try-catch 블록 구조 문제
- **상태**: 수정 진행 중

### 2. 블로그 추출 품질
- **네이버 블로그**: Puppeteer 솔루션 구현 완료, 테스트 필요
- **일반 블로그**: 제목+본문 분리 로직 완료

## 개발 환경
- **Node.js/Express** 서버
- **Claude 3.5 Sonnet** (분류/생성)
- **OpenAI GPT** (파인튜닝)
- **Puppeteer** (동적 웹 크롤링) - 새로 추가
- **localStorage** (클라이언트 상태 관리)
- **포트**: 3000

## 다음 우선순위
1. **긴급**: server.js syntax error 수정
2. **높음**: Puppeteer 블로그 추출 테스트 및 검증
3. **중간**: RLHF 최종 제출 인터페이스 구현
4. **낮음**: 분류 정확도 모니터링 및 개선

## 주요 명령어
- `node server.js`: 서버 시작
- `node -c server.js`: syntax 체크
- `npm start`: 개발 서버 실행
- `localhost:3000`: 웹 인터페이스 접근

## 최근 변경사항
1. Puppeteer 통합으로 JavaScript 렌더링 지원
2. 네이버 블로그 다중 접근 방식 구현
3. 제목+본문만 추출하는 정제된 로직
4. 스피닝 로딩 아이콘 텍스트 회전 문제 해결
5. RLHF 제출 단계 분리 (제안하기 vs 최종제출)

---
*마지막 업데이트: 2025-05-27*
*세션 연속성을 위한 Claude 메모리 파일*
*현재 상태: 블로그 추출 Puppeteer 솔루션 구현, syntax error 해결 필요*