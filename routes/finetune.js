const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse, errorResponse, logError } = require('../lib/utils');
const OpenAIFineTuner = require('../scripts/finetune_openai');
const FineTuneDataPreparer = require('../scripts/prepare_finetune_data');

const router = express.Router();

// 파인튜닝 매니저 인스턴스 (안전하게 초기화)
let fineTuner, dataPreparer;

try {
  console.log('🔄 파인튜닝 매니저 초기화 중...');
  fineTuner = new OpenAIFineTuner();
  console.log('✅ OpenAI FineTuner 초기화 완료');
  
  dataPreparer = new FineTuneDataPreparer();
  console.log('✅ Data Preparer 초기화 완료');
} catch (error) {
  console.error('❌ 파인튜닝 매니저 초기화 실패:', error.message);
  console.error('스택:', error.stack);
}

// 데이터셋 상태 조회
router.get('/dataset-stats', asyncHandler(async (req, res) => {
  try {
    console.log('📊 데이터셋 상태 조회 요청');
    
    // 인스턴스 확인
    if (!dataPreparer) {
      throw new Error('Data Preparer가 초기화되지 않았습니다.');
    }
    
    // 데이터셋 통계 수집
    const stats = {
      trainingExamples: 0,
      approvedData: 0,
      rlhfData: 0,
      totalSamples: 0,
      categories: {
        title: 0,
        firstparagraph: 0,
        closing: 0,
        story: 0,
        usp: 0
      }
    };
    
    console.log('🔄 데이터 수집 시작...');

    // 훈련 예시 수집
    const trainingData = dataPreparer.loadTrainingExamples('title').length +
                        dataPreparer.loadTrainingExamples('firstparagraph').length +
                        dataPreparer.loadTrainingExamples('closing').length +
                        dataPreparer.loadTrainingExamples('story').length +
                        dataPreparer.loadTrainingExamples('usp').length;
    stats.trainingExamples = trainingData;

    // 승인된 데이터 수집
    const approvedData = dataPreparer.loadApprovedData('title').length +
                        dataPreparer.loadApprovedData('firstparagraph').length +
                        dataPreparer.loadApprovedData('closing').length +
                        dataPreparer.loadApprovedData('story').length +
                        dataPreparer.loadApprovedData('usp').length;
    stats.approvedData = approvedData;

    // RLHF 고품질 데이터 수집
    const rlhfData = dataPreparer.loadHighQualityRLHFData('title').length +
                    dataPreparer.loadHighQualityRLHFData('firstparagraph').length +
                    dataPreparer.loadHighQualityRLHFData('closing').length +
                    dataPreparer.loadHighQualityRLHFData('story').length +
                    dataPreparer.loadHighQualityRLHFData('usp').length;
    stats.rlhfData = rlhfData;

    // 카테고리별 상세 통계
    const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
    for (const category of categories) {
      const categoryTotal = dataPreparer.loadTrainingExamples(category).length +
                           dataPreparer.loadApprovedData(category).length +
                           dataPreparer.loadHighQualityRLHFData(category).length;
      stats.categories[category] = categoryTotal;
    }

    stats.totalSamples = stats.trainingExamples + stats.approvedData + stats.rlhfData;

    console.log('✅ 데이터셋 상태:', stats);
    res.json(successResponse(stats, '데이터셋 상태를 성공적으로 조회했습니다.'));

  } catch (error) {
    logError('Dataset stats error', error);
    res.status(500).json(errorResponse('데이터셋 상태 조회 중 오류가 발생했습니다.'));
  }
}));

// 파인튜닝 시작
router.post('/start', asyncHandler(async (req, res) => {
  try {
    console.log('🚀 파인튜닝 시작 요청');
    
    // 인스턴스 확인
    if (!fineTuner || !dataPreparer) {
      throw new Error('파인튜닝 매니저가 초기화되지 않았습니다.');
    }
    
    // 데이터셋 생성
    console.log('📊 데이터셋 준비 중...');
    const datasetPath = await dataPreparer.generateFineTuneDataset();
    
    // 파인튜닝 시작
    console.log('🏃‍♂️ 파인튜닝 작업 시작...');
    const result = await fineTuner.runFullFineTuning(datasetPath);
    
    console.log('✅ 파인튜닝 작업 생성:', result);
    
    res.json(successResponse(result, '파인튜닝 작업이 성공적으로 시작되었습니다.'));

  } catch (error) {
    logError('Fine-tuning start error', error);
    res.status(500).json(errorResponse('파인튜닝 시작 중 오류가 발생했습니다: ' + error.message));
  }
}));

// 파인튜닝 작업 목록 조회
router.get('/jobs', asyncHandler(async (req, res) => {
  try {
    console.log('📋 파인튜닝 작업 목록 조회');
    
    const jobs = await fineTuner.listFineTuningJobs();
    
    // 최신 순으로 정렬하고 상위 20개만 반환
    const recentJobs = jobs.slice(0, 20).map(job => ({
      id: job.id,
      status: job.status,
      model: job.fine_tuned_model || null,
      created_at: job.created_at,
      finished_at: job.finished_at || null,
      training_file: job.training_file,
      error: job.error || null
    }));

    console.log(`✅ ${recentJobs.length}개 작업 조회 완료`);
    res.json(successResponse(recentJobs, '파인튜닝 작업 목록을 성공적으로 조회했습니다.'));

  } catch (error) {
    logError('Fine-tuning jobs list error', error);
    res.status(500).json(errorResponse('작업 목록 조회 중 오류가 발생했습니다.'));
  }
}));

// 특정 작업 상태 조회
router.get('/jobs/:jobId/status', asyncHandler(async (req, res) => {
  try {
    const { jobId } = req.params;
    console.log(`📊 작업 ${jobId} 상태 조회`);
    
    const jobStatus = await fineTuner.checkFineTuningStatus(jobId);
    
    const result = {
      id: jobStatus.id,
      status: jobStatus.status,
      model: jobStatus.fine_tuned_model || null,
      created_at: jobStatus.created_at,
      finished_at: jobStatus.finished_at || null,
      error: jobStatus.error || null,
      result_files: jobStatus.result_files || []
    };

    console.log(`✅ 작업 ${jobId} 상태:`, result.status);
    res.json(successResponse(result, '작업 상태를 성공적으로 조회했습니다.'));

  } catch (error) {
    logError('Fine-tuning job status error', error);
    res.status(500).json(errorResponse('작업 상태 조회 중 오류가 발생했습니다.'));
  }
}));

// 모델 테스트
router.post('/test', asyncHandler(async (req, res) => {
  try {
    const { modelId, testInput } = req.body;
    
    if (!modelId || !testInput) {
      return res.status(400).json(errorResponse('modelId와 testInput이 필요합니다.'));
    }

    console.log(`🧪 모델 ${modelId} 테스트 시작`);
    
    const result = await fineTuner.testFineTunedModel(modelId, testInput);
    
    console.log('✅ 모델 테스트 완료');
    res.json(successResponse({ 
      input: testInput, 
      output: result,
      model: modelId,
      timestamp: new Date().toISOString()
    }, '모델 테스트가 성공적으로 완료되었습니다.'));

  } catch (error) {
    logError('Model test error', error);
    res.status(500).json(errorResponse('모델 테스트 중 오류가 발생했습니다: ' + error.message));
  }
}));

// 성공한 모델 목록 조회 (테스트용)
router.get('/models', asyncHandler(async (req, res) => {
  try {
    console.log('🤖 사용 가능한 모델 목록 조회');
    
    const jobs = await fineTuner.listFineTuningJobs();
    
    // 성공한 작업의 모델만 필터링
    const availableModels = jobs
      .filter(job => job.status === 'succeeded' && job.fine_tuned_model)
      .slice(0, 10) // 최신 10개만
      .map(job => ({
        id: job.fine_tuned_model,
        name: job.fine_tuned_model,
        created_at: job.created_at,
        job_id: job.id
      }));

    console.log(`✅ ${availableModels.length}개 모델 조회 완료`);
    res.json(successResponse(availableModels, '사용 가능한 모델 목록을 성공적으로 조회했습니다.'));

  } catch (error) {
    logError('Available models error', error);
    res.status(500).json(errorResponse('모델 목록 조회 중 오류가 발생했습니다.'));
  }
}));

// 파인튜닝 로그 조회
router.get('/logs', asyncHandler(async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const logPath = path.join(__dirname, '../finetune_log.jsonl');
    
    if (!fs.existsSync(logPath)) {
      return res.json(successResponse([], '아직 로그가 없습니다.'));
    }

    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    // 최근 50개 로그만 반환
    const logs = lines.slice(-50).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(log => log !== null);

    res.json(successResponse(logs, '파인튜닝 로그를 성공적으로 조회했습니다.'));

  } catch (error) {
    logError('Fine-tuning logs error', error);
    res.status(500).json(errorResponse('로그 조회 중 오류가 발생했습니다.'));
  }
}));

// 환경변수에 모델 적용
router.post('/apply-model', asyncHandler(async (req, res) => {
  try {
    const { modelId } = req.body;
    
    if (!modelId) {
      return res.status(400).json(errorResponse('modelId가 필요합니다.'));
    }

    console.log(`🔧 모델 ${modelId}를 환경변수에 적용 중...`);
    
    fineTuner.updateEnvFile(modelId);
    
    console.log('✅ 환경변수 업데이트 완료');
    res.json(successResponse({ modelId }, '모델이 성공적으로 적용되었습니다. 서버를 재시작하면 새 모델이 적용됩니다.'));

  } catch (error) {
    logError('Model apply error', error);
    res.status(500).json(errorResponse('모델 적용 중 오류가 발생했습니다.'));
  }
}));

module.exports = router;