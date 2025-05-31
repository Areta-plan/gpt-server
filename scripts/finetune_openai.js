require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getOpenAIClient } = require('../lib/openaiClient');

class OpenAIFineTuner {
  constructor() {
    this.client = getOpenAIClient();
    this.dataDir = path.join(__dirname, '../fine_tune_data');
    this.modelsDir = path.join(__dirname, '../models');
    this.logPath = path.join(__dirname, '../finetune_log.jsonl');
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.dataDir, this.modelsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // 파인튜닝 데이터 업로드
  async uploadTrainingData(filePath) {
    try {
      console.log('📤 훈련 데이터 업로드 중...');
      
      const fileStream = fs.createReadStream(filePath);
      
      const uploadResponse = await this.client.files.create({
        file: fileStream,
        purpose: 'fine-tune'
      });

      console.log(`✅ 파일 업로드 완료: ${uploadResponse.id}`);
      
      // 로그 기록
      this.logEvent({
        type: 'file_upload',
        file_id: uploadResponse.id,
        filename: path.basename(filePath),
        timestamp: new Date().toISOString()
      });

      return uploadResponse.id;
    } catch (error) {
      console.error('❌ 파일 업로드 실패:', error.message);
      throw error;
    }
  }

  // 파인튜닝 작업 시작
  async startFineTuning(fileId, modelName = 'classification-model') {
    try {
      console.log('🚀 파인튜닝 작업 시작...');

      const fineTuneResponse = await this.client.fineTuning.jobs.create({
        training_file: fileId,
        model: 'gpt-4o-mini-2024-07-18', // 최신 미니 모델 사용
        hyperparameters: {
          n_epochs: 3, // 에포크 수 (3-4가 적당)
          batch_size: 'auto', // 자동 배치 사이즈
          learning_rate_multiplier: 'auto' // 자동 학습률
        },
        suffix: modelName,
        validation_file: null // 검증 파일 없음 (전체 데이터를 훈련용으로 사용)
      });

      console.log(`✅ 파인튜닝 작업 생성: ${fineTuneResponse.id}`);
      console.log(`📊 모델 이름: ${fineTuneResponse.fine_tuned_model || '훈련 중...'}`);
      
      // 로그 기록
      this.logEvent({
        type: 'finetune_start',
        job_id: fineTuneResponse.id,
        file_id: fileId,
        model_name: modelName,
        timestamp: new Date().toISOString(),
        status: fineTuneResponse.status
      });

      return fineTuneResponse;
    } catch (error) {
      console.error('❌ 파인튜닝 시작 실패:', error.message);
      throw error;
    }
  }

  // 파인튜닝 상태 확인
  async checkFineTuningStatus(jobId) {
    try {
      const jobStatus = await this.client.fineTuning.jobs.retrieve(jobId);
      
      console.log(`📊 작업 ID: ${jobId}`);
      console.log(`📊 상태: ${jobStatus.status}`);
      console.log(`📊 모델: ${jobStatus.fine_tuned_model || '훈련 중...'}`);
      
      if (jobStatus.status === 'succeeded' && jobStatus.fine_tuned_model) {
        console.log(`🎉 파인튜닝 완료! 모델 ID: ${jobStatus.fine_tuned_model}`);
        
        // 환경변수 파일 업데이트
        this.updateEnvFile(jobStatus.fine_tuned_model);
        
        // 로그 기록
        this.logEvent({
          type: 'finetune_success',
          job_id: jobId,
          model_id: jobStatus.fine_tuned_model,
          timestamp: new Date().toISOString()
        });
      } else if (jobStatus.status === 'failed') {
        console.error(`❌ 파인튜닝 실패: ${jobStatus.error?.message || '알 수 없는 오류'}`);
        
        this.logEvent({
          type: 'finetune_failed',
          job_id: jobId,
          error: jobStatus.error?.message,
          timestamp: new Date().toISOString()
        });
      }

      return jobStatus;
    } catch (error) {
      console.error('❌ 상태 확인 실패:', error.message);
      throw error;
    }
  }

  // 환경변수 파일 업데이트
  updateEnvFile(modelId) {
    try {
      const envPath = path.join(__dirname, '../.env');
      let envContent = '';

      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }

      // OPENAI_CLASSIFICATION_MODEL 라인 찾기 또는 추가
      const lines = envContent.split('\n');
      let updated = false;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('OPENAI_CLASSIFICATION_MODEL=')) {
          lines[i] = `OPENAI_CLASSIFICATION_MODEL=${modelId}`;
          updated = true;
          break;
        }
      }

      if (!updated) {
        lines.push(`OPENAI_CLASSIFICATION_MODEL=${modelId}`);
      }

      fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
      console.log(`✅ .env 파일 업데이트: OPENAI_CLASSIFICATION_MODEL=${modelId}`);

      // 모델 정보를 별도 파일로도 저장
      const modelInfoPath = path.join(this.modelsDir, 'latest_model.txt');
      fs.writeFileSync(modelInfoPath, modelId, 'utf8');

    } catch (error) {
      console.error('❌ 환경변수 업데이트 실패:', error.message);
    }
  }

  // 전체 파인튜닝 프로세스 실행
  async runFullFineTuning(dataPath) {
    try {
      console.log('🔄 전체 파인튜닝 프로세스 시작...');
      console.log(`📁 데이터 파일: ${dataPath}`);

      // 1. 데이터 업로드
      const fileId = await this.uploadTrainingData(dataPath);
      
      // 2. 파인튜닝 시작
      const job = await this.startFineTuning(fileId, 'blog-classification');
      
      console.log('\n⏳ 파인튜닝이 진행 중입니다...');
      console.log('📝 상태 확인 명령어:');
      console.log(`   node scripts/finetune_openai.js status ${job.id}`);
      console.log('\n💡 일반적으로 5-20분 정도 소요됩니다.');

      return {
        jobId: job.id,
        fileId: fileId,
        status: job.status
      };

    } catch (error) {
      console.error('❌ 파인튜닝 프로세스 실패:', error.message);
      throw error;
    }
  }

  // 파인튜닝된 모델로 테스트
  async testFineTunedModel(modelId, testInput, category = 'title') {
    try {
      console.log(`🧪 파인튜닝된 모델 테스트 (${category})...`);
      
      // 카테고리별 시스템 프롬프트 정의
      const CLASSIFICATION_PROMPTS = require('../lib/classificationPrompts');
      const systemPrompts = {
        title: "당신은 블로그 제목 생성 전문가입니다. 주어진 키워드와 의도를 분석하여 클릭률이 높은 매력적인 제목을 생성하세요.\n\n규칙:\n1. 호기심을 자극하는 표현 사용\n2. 구체적이고 실용적인 정보 제시\n3. 감정적 어필 요소 포함\n4. 20-40자 내외 길이\n5. 검색 키워드 자연스럽게 포함",
        firstparagraph: "당신은 블로그 첫 문단 분류 전문가입니다. 주어진 첫 문단을 분석하여 REMA 법칙에 따라 분류하세요.",
        closing: "당신은 블로그 클로징 문단 분류 전문가입니다. 주어진 클로징 문단의 정서적 특성과 독자에게 의도된 효과를 분석하여 태그를 분류하세요.",
        story: "당신은 블로그 스토리텔링 분석 전문가입니다. 주어진 내용이 스토리텔링 유형에 해당하는지 분석하고 6개 태그로 분류하세요.",
        usp: "당신은 세일즈 심리와 설득 카피라이팅에 능한 마케팅 분석가입니다. 블로그 본문에서 숨겨진 설득 구조를 추론하여 자사의 핵심 강점(USP)을 도출하고 태깅하세요."
      };
      
      const systemPrompt = systemPrompts[category] || systemPrompts.title;
      
      const response = await this.client.chat.completions.create({
        model: modelId,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: testInput
          }
        ],
        max_tokens: category === 'title' ? 100 : 500,
        temperature: 0.7
      });

      const result = response.choices[0].message.content;
      console.log(`✅ 테스트 결과: ${result}`);
      
      return result;
    } catch (error) {
      console.error('❌ 모델 테스트 실패:', error.message);
      throw error;
    }
  }

  // 이벤트 로그 기록
  logEvent(event) {
    try {
      const logEntry = JSON.stringify(event) + '\n';
      fs.appendFileSync(this.logPath, logEntry, 'utf8');
    } catch (error) {
      console.error('❌ 로그 기록 실패:', error.message);
    }
  }

  // 모든 파인튜닝 작업 조회
  async listFineTuningJobs() {
    try {
      const jobs = await this.client.fineTuning.jobs.list();
      
      console.log('📋 파인튜닝 작업 목록:');
      jobs.data.forEach(job => {
        console.log(`  🆔 ${job.id}`);
        console.log(`     상태: ${job.status}`);
        console.log(`     모델: ${job.fine_tuned_model || '훈련 중'}`);
        console.log(`     생성: ${new Date(job.created_at * 1000).toLocaleString()}`);
        console.log('');
      });

      return jobs.data;
    } catch (error) {
      console.error('❌ 작업 목록 조회 실패:', error.message);
      throw error;
    }
  }
}

// CLI 실행 부분
if (require.main === module) {
  const fineTuner = new OpenAIFineTuner();
  const args = process.argv.slice(2);

  async function main() {
    try {
      if (args.length === 0) {
        // 기본 실행: 데이터 준비 + 파인튜닝
        const FineTuneDataPreparer = require('./prepare_finetune_data');
        const preparer = new FineTuneDataPreparer();
        
        console.log('1️⃣ 파인튜닝 데이터 준비 중...');
        const dataPath = await preparer.generateFineTuneDataset();
        
        console.log('\n2️⃣ OpenAI 파인튜닝 시작...');
        const result = await fineTuner.runFullFineTuning(dataPath);
        
        console.log('\n✅ 초기 설정 완료!');
        console.log(`📝 작업 ID: ${result.jobId}`);

      } else if (args[0] === 'status') {
        // 상태 확인
        if (!args[1]) {
          console.error('❌ 사용법: node scripts/finetune_openai.js status <JOB_ID>');
          return;
        }
        await fineTuner.checkFineTuningStatus(args[1]);

      } else if (args[0] === 'list') {
        // 작업 목록 조회
        await fineTuner.listFineTuningJobs();

      } else if (args[0] === 'test') {
        // 모델 테스트
        if (!args[1]) {
          console.error('❌ 사용법: node scripts/finetune_openai.js test <MODEL_ID> [TEST_INPUT]');
          return;
        }
        const testInput = args[2] || '[Keyword]: 대구 렌트카\n[Intent]: 확인하지 않으면 실제 피해가 발생한다는 경고\n[Tags]: [Threat], [Warning]';
        await fineTuner.testFineTunedModel(args[1], testInput);

      } else {
        console.error('❌ 알 수 없는 명령어');
        console.log('사용법:');
        console.log('  node scripts/finetune_openai.js                    # 전체 프로세스 실행');
        console.log('  node scripts/finetune_openai.js status <JOB_ID>    # 상태 확인');
        console.log('  node scripts/finetune_openai.js list               # 작업 목록');
        console.log('  node scripts/finetune_openai.js test <MODEL_ID>    # 모델 테스트');
      }

    } catch (error) {
      console.error('❌ 실행 오류:', error.message);
      process.exit(1);
    }
  }

  main();
}

module.exports = OpenAIFineTuner;