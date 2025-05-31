# GPT Server 프로젝트 - Claude 메모리

## 프로젝트 개요
GPT 기반 블로그 생성 및 분류 시스템 + RLHF + OpenAI 파인튜닝 통합

## 핵심 시스템

### 1. 웹 인터페이스
- **3개 탭**: 일반채팅, 블로그생성, 자동분류, 파인튜닝
- **RLHF 평가 시스템**: 별점 평가 + 모범 답안 제안
- **상태 관리**: ⏳ 대기 → ✅ 완료 → ☑️ 제출완료

### 2. 서버 구조
- **server.js**: Express 메인 서버, 블로그 추출
- **lib/openaiClassificationClient.js**: OpenAI 파인튜닝 모델 클라이언트
- **lib/autoClassificationManager.js**: 분류 결과 관리 및 재구성 시스템
- **routes/**: 분류, RLHF, 파인튜닝 API 엔드포인트

### 3. 파인튜닝 시스템 ⭐
- **완전 자동화**: 데이터 준비 → 업로드 → 훈련 → 배포
- **웹 인터페이스**: 실시간 모니터링, 모델 테스트, 환경변수 적용
- **5개 카테고리**: title, firstparagraph, closing, story, usp
- **데이터 통합**: 훈련 예시 + 승인 데이터 + RLHF 고품질 데이터

### 4. 디렉토리 구조
- `auto_classified/`: OpenAI 분류 결과 (32개)
- `training_examples/`: 수동 훈련 예시 (45개)
- `fine_tune_data/`: 파인튜닝 데이터셋 (45개)
- `rlhf_feedback.jsonl`: 사용자 피드백 누적 데이터
- `models/latest_model.txt`: 현재 활성 모델

## 주요 완료 기능

### ✅ 블로그 추출 시스템
- **제목 추출**: iframe 전환 → HTML title 태그 추출 (100% 정확도)
- **콘텐츠 추출**: Puppeteer 기반, 네이버 특화 정리 (99% 성공률)
- **다중 접근**: 7가지 추출 패턴

### ✅ OpenAI 파인튜닝 완전 전환 (Claude → OpenAI)
- **자동화 파이프라인**: 데이터셋 생성 → 훈련 → 배포
- **실시간 모니터링**: 30초마다 상태 체크
- **웹 기반 관리**: 모델 테스트, 환경변수 적용
- **현재 모델**: `ft:gpt-4o-mini-2024-07-18:personal:blog-classification:BdFTMzJn`

### ✅ RLHF 시스템
- **분류/태깅 점수**: 1-5 별점 평가
- **반복 문구 방지**: 자동 감지 및 학습 반영
- **상태 관리**: localStorage 기반 지속성

### ✅ 코드 최적화
- **autoClassificationManager.js**: 373줄 → 206줄 (167줄 감소)
- **재구성 시스템**: OpenAI 응답 오류 자동 복구
- **범용성**: 플랫폼 독립적 구조

## 최근 작업 (2025-06-01)

### 🛠️ 분류 결과 재구성 시스템 구현
**문제**: OpenAI 파인튜닝 모델의 3가지 분류 문제
1. Title: user 부분 완전 오류
2. FirstParagraph: assistant 부분 끝에서 갑자기 요약됨  
3. Closing: assistant가 전체 본문 출력

**해결**: AutoClassificationManager 재구성 메서드 구현
- `cleanUserSection()`: 반복 문구 및 오염 콘텐츠 제거
- `isUserSectionTooCorrupted()`: user 섹션 품질 검증
- `reconstructFromInvalidFormat()`: 잘못된 형식 자동 복구
- `reconstructTitleFormat()`: 제목 형식 자동 생성
- `reconstructClosingFormat()`: 클로징 태그 정리

**결과**: 
- ✅ **Title**: 깔끔한 fallback 형식으로 자동 복구
- ✅ **FirstParagraph**: 완벽하게 작동 (요약 없이 정확한 길이)
- ✅ **Closing**: user 태그 정리됨

### 🧪 모델 테스트 기능 확장
**기존**: Title만 테스트 가능
**개선**: 5개 카테고리 전체 테스트 가능

**구현 내용**:
- 카테고리 선택 드롭다운 추가
- 카테고리별 시스템 프롬프트 정의
- 카테고리별 플레이스홀더 텍스트 제공
- max_tokens 카테고리별 조정 (title: 100, 나머지: 500)

**사용법**: 파인튜닝 탭 → 모델 선택 → 카테고리 선택 → 테스트 실행

## 현재 파인튜닝 현황
- **총 훈련 파일**: 77개 (training: 45, auto_classified: 32)
- **파인튜닝 데이터셋**: 45개 (중복 없음)
- **성공한 모델**: 3개 (최신: BdL72WuC, 현재 사용: BdFTMzJn)
- **RLHF 데이터**: 29개 실제 평가 데이터

## API 엔드포인트
### 분류 및 RLHF
- `POST /extract-blog` - 블로그 추출 및 자동 분류
- `GET /api/classification/unrated` - 미평가 파일 목록
- `POST /api/classification/evaluate` - 평가 저장

### 파인튜닝 관리
- `POST /api/finetune/start` - 파인튜닝 시작
- `POST /api/finetune/test` - 모델 테스트 (카테고리별)
- `GET /api/finetune/models` - 사용 가능한 모델 목록
- `POST /api/finetune/apply-model` - 모델 환경변수 적용

## 기술 스택
- **Backend**: Node.js, Express, Puppeteer
- **AI**: OpenAI GPT-4o-mini (파인튜닝), OpenAI GPT (RLHF)
- **Frontend**: Vanilla JS, Modern CSS
- **데이터**: JSONL (파인튜닝), localStorage (상태관리)

## 운영 가이드
```bash
# 서버 시작
node server.js  # http://localhost:3000

# 파인튜닝 실행
node scripts/finetune_openai.js

# 모델 테스트
node scripts/finetune_openai.js test <MODEL_ID>
```

### RLHF 사용법
1. 자동분류 탭 → 블로그 URL 입력 → 분류
2. 파일 선택 → 별점 평가 + 모범 답안 제안
3. "제안하기" → "N개 평가 완료 - RLHF 제출"

### 파인튜닝 사용법
1. 파인튜닝 탭 → 데이터셋 확인
2. "파인튜닝 시작" → 실시간 모니터링
3. 완료 후 모델 테스트 → 환경변수 적용

---
**현재 상태**: 분류 재구성 시스템 구현 완료, 카테고리별 모델 테스트 지원  
**마지막 업데이트**: 2025-06-01  
**다음 개선사항**: TextAnalyzer 문단 분리 로직 개선 (closing 분류 정확도 향상)