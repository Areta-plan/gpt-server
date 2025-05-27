const fs = require('fs');
const path = require('path');

class ClassificationManager {
  constructor() {
    this.autoClassifiedDir = path.join(__dirname, '../auto_classified');
    this.claudeApprovedDir = path.join(__dirname, '../claude_approved');
    this.evaluationsDir = path.join(__dirname, '../evaluations');
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [this.evaluationsDir];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // auto_classified 폴더에서 분류된 파일들 목록 가져오기 (RLHF 평가 완료 파일 제외)
  getUnratedClassifications() {
    const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
    const unrated = {};

    // RLHF 피드백에서 완료된 파일 목록 로드
    const completedFiles = this.getCompletedRLHFFiles();

    for (const category of categories) {
      const categoryDir = path.join(this.autoClassifiedDir, category);
      if (!fs.existsSync(categoryDir)) continue;

      const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.txt'));
      unrated[category] = [];

      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        
        // RLHF 평가 완료된 파일인지 확인 (파일 생성 시간도 고려)
        const fileKey = `${category}/${file}`;
        const fileStat = fs.statSync(filePath);
        const fileCreationTime = fileStat.mtime.getTime();
        
        if (completedFiles.has(fileKey)) {
          // 파일 생성 시간이 피드백 시간보다 최근인지 확인
          const feedbackTime = this.getLatestFeedbackTime(fileKey);
          if (feedbackTime && fileCreationTime > feedbackTime) {
            // 새로 생성된 파일이므로 평가 대상에 포함
          } else {
            continue; // 이미 평가된 파일 건너뛰기
          }
        }
        const evaluationPath = path.join(this.evaluationsDir, `${category}_${file.replace('.txt', '.json')}`);
        
        // 기존 평가 시스템과도 호환 (둘 다 확인)
        if (!fs.existsSync(evaluationPath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const [userPart, assistantPart] = content.split('===assistant===');
            
            unrated[category].push({
              filename: file,
              classification: userPart.replace('===user===', '').trim(),
              content: assistantPart ? assistantPart.trim() : '',
              filePath: filePath
            });
          } catch (error) {
            // 파일 읽기 오류 무시 (로그 스팸 방지)
          }
        }
      }
    }

    const totalUnrated = Object.values(unrated).reduce((total, items) => total + items.length, 0);
    if (totalUnrated > 0) {
      console.log(`📋 미평가 파일 로드: ${totalUnrated}개`);
    }
    return unrated;
  }

  // 특정 파일의 최신 피드백 시간 조회
  getLatestFeedbackTime(fileKey) {
    const rlhfFeedbackPath = path.join(__dirname, '../rlhf_feedback.jsonl');
    
    try {
      if (!fs.existsSync(rlhfFeedbackPath)) {
        return null;
      }

      const content = fs.readFileSync(rlhfFeedbackPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      let latestTime = null;
      
      for (const line of lines) {
        try {
          const feedback = JSON.parse(line);
          
          // 개별 평가 피드백에서 해당 파일 찾기
          if (feedback.type === 'individual_evaluation' && feedback.filename && feedback.category) {
            const feedbackFileKey = `${feedback.category}/${feedback.filename}`;
            if (feedbackFileKey === fileKey && feedback.timestamp) {
              const feedbackTime = new Date(feedback.timestamp).getTime();
              if (!latestTime || feedbackTime > latestTime) {
                latestTime = feedbackTime;
              }
            }
          }
        } catch (parseError) {
          // 무시
        }
      }
      
      return latestTime;
    } catch (error) {
      return null;
    }
  }

  // RLHF 피드백에서 완료된 파일 목록 추출
  getCompletedRLHFFiles() {
    const completedFiles = new Set();
    const rlhfFeedbackPath = path.join(__dirname, '../rlhf_feedback.jsonl');
    
    try {
      if (!fs.existsSync(rlhfFeedbackPath)) {
        return completedFiles;
      }

      const content = fs.readFileSync(rlhfFeedbackPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      // 최종 제출 여부 확인
      let hasFinalSubmission = false;
      
      for (const line of lines) {
        try {
          const feedback = JSON.parse(line);
          
          // 개별 평가 피드백 처리 (완료된 파일로 간주)
          if (feedback.type === 'individual_evaluation' && feedback.filename && feedback.category) {
            const fileKey = `${feedback.category}/${feedback.filename}`;
            completedFiles.add(fileKey);
          }
          // 일괄 평가 (최종 제출) 확인
          else if (feedback.type === 'bulk_evaluation' && feedback.evaluations) {
            hasFinalSubmission = true;
          }
          // 기존 피드백 형태도 지원 (content 기반 매핑)
          else if (feedback.category && feedback.content) {
            // content 기반으로 실제 파일 찾기
            const matchedFile = this.findFileByContent(feedback.category, feedback.content);
            if (matchedFile) {
              const fileKey = `${feedback.category}/${matchedFile}`;
              completedFiles.add(fileKey);
            }
          }
        } catch (parseError) {
          console.error(`❌ RLHF 피드백 파싱 오류:`, parseError.message);
        }
      }

      // 최종 제출이 있었다면 모든 파일을 완료된 것으로 처리
      if (hasFinalSubmission) {
        // 모든 파일을 완료된 것으로 마킹하여 목록에서 제거
        const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
        for (const category of categories) {
          const categoryDir = path.join(this.autoClassifiedDir, category);
          if (fs.existsSync(categoryDir)) {
            const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.txt'));
            files.forEach(file => {
              completedFiles.add(`${category}/${file}`);
            });
          }
        }
      }

      return completedFiles;
    } catch (error) {
      console.error(`❌ RLHF 피드백 로드 오류:`, error.message);
      return completedFiles;
    }
  }

  // content 기반으로 실제 파일 찾기
  findFileByContent(category, content) {
    try {
      const categoryDir = path.join(this.autoClassifiedDir, category);
      if (!fs.existsSync(categoryDir)) return null;

      const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.txt'));
      
      // 더 유연한 매칭을 위해 키워드 추출
      const contentKeywords = this.extractKeywords(content);
      
      for (const file of files) {
        try {
          const filePath = path.join(categoryDir, file);
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const [userPart, assistantPart] = fileContent.split('===assistant===');
          const classification = userPart.replace('===user===', '').trim();
          const fileRawContent = assistantPart ? assistantPart.trim() : '';
          
          // 전체 파일 텍스트에서 키워드 매칭
          const fullText = (classification + ' ' + fileRawContent).toLowerCase();
          const contentLower = content.toLowerCase();
          
          // 직접 매칭 또는 키워드 매칭
          if (fullText.includes(contentLower) || contentLower.includes(fullText.substring(0, 50)) ||
              contentKeywords.some(keyword => fullText.includes(keyword))) {
            return file;
          }
        } catch (error) {
          console.error(`❌ 파일 읽기 오류 ${file}:`, error.message);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`❌ findFileByContent 오류:`, error.message);
      return null;
    }
  }

  // 간단한 키워드 추출
  extractKeywords(text) {
    return text.toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 5); // 상위 5개 키워드만
  }

  // 사용자 평가 저장
  saveEvaluation(category, filename, rating, feedback = '', improvements = '') {
    const evaluationData = {
      category,
      filename,
      rating, // 1-5 점수
      feedback, // 사용자 피드백
      improvements, // 개선 사항
      evaluatedAt: new Date().toISOString(),
      evaluatedBy: 'user'
    };

    const evaluationPath = path.join(this.evaluationsDir, `${category}_${filename.replace('.txt', '.json')}`);
    
    try {
      fs.writeFileSync(evaluationPath, JSON.stringify(evaluationData, null, 2), 'utf8');
      console.log(`✅ Evaluation saved: ${category}/${filename} - Rating: ${rating}/5`);
      
      // 4점 이상이면 claude_approved로 이동
      if (rating >= 4) {
        this.approveClassification(category, filename);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Error saving evaluation:`, error.message);
      return false;
    }
  }

  // 높은 점수의 분류를 claude_approved로 이동
  approveClassification(category, filename) {
    try {
      const sourcePath = path.join(this.autoClassifiedDir, category, filename);
      const targetDir = path.join(this.claudeApprovedDir, category);
      const targetPath = path.join(targetDir, filename);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ Approved and moved to claude_approved: ${category}/${filename}`);
      
      return true;
    } catch (error) {
      console.error(`❌ Error approving classification:`, error.message);
      return false;
    }
  }

  // 평가 통계 조회
  getEvaluationStats() {
    const evaluationFiles = fs.readdirSync(this.evaluationsDir).filter(f => f.endsWith('.json'));
    const stats = {
      total: 0,
      byCategory: {},
      byRating: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      avgRating: 0,
      approved: 0
    };

    let totalRating = 0;

    for (const file of evaluationFiles) {
      try {
        const evaluation = JSON.parse(fs.readFileSync(path.join(this.evaluationsDir, file), 'utf8'));
        const category = evaluation.category;
        
        stats.total++;
        totalRating += evaluation.rating;
        
        if (!stats.byCategory[category]) {
          stats.byCategory[category] = { count: 0, avgRating: 0, totalRating: 0 };
        }
        
        stats.byCategory[category].count++;
        stats.byCategory[category].totalRating += evaluation.rating;
        stats.byCategory[category].avgRating = stats.byCategory[category].totalRating / stats.byCategory[category].count;
        
        stats.byRating[evaluation.rating]++;
        
        if (evaluation.rating >= 4) {
          stats.approved++;
        }
        
      } catch (error) {
        console.error(`❌ Error reading evaluation ${file}:`, error.message);
      }
    }

    if (stats.total > 0) {
      stats.avgRating = totalRating / stats.total;
    }

    return stats;
  }

  // 낮은 점수 항목들 조회 (개선 필요)
  getLowRatedItems(threshold = 2) {
    const evaluationFiles = fs.readdirSync(this.evaluationsDir).filter(f => f.endsWith('.json'));
    const lowRated = [];

    for (const file of evaluationFiles) {
      try {
        const evaluation = JSON.parse(fs.readFileSync(path.join(this.evaluationsDir, file), 'utf8'));
        
        if (evaluation.rating <= threshold) {
          lowRated.push(evaluation);
        }
        
      } catch (error) {
        console.error(`❌ Error reading evaluation ${file}:`, error.message);
      }
    }

    return lowRated.sort((a, b) => a.rating - b.rating);
  }

  // 특정 카테고리의 미평가 항목 수 조회
  getUnratedCount(category = null) {
    const unrated = this.getUnratedClassifications();
    
    if (category) {
      return unrated[category] ? unrated[category].length : 0;
    }
    
    return Object.values(unrated).reduce((total, items) => total + items.length, 0);
  }

  // 파일 삭제
  deleteFile(category, filename, reason = '') {
    try {
      const filePath = path.join(this.autoClassifiedDir, category, filename);
      
      // 파일이 존재하는지 확인
      if (!fs.existsSync(filePath)) {
        console.log(`파일이 존재하지 않습니다: ${filePath}`);
        return false;
      }
      
      // 백업을 위해 삭제된 파일 디렉토리 생성
      const deletedDir = path.join(__dirname, '../deleted_files', category);
      if (!fs.existsSync(deletedDir)) {
        fs.mkdirSync(deletedDir, { recursive: true });
      }
      
      // 삭제 로그 파일 생성
      const deleteLog = {
        filename,
        category,
        reason,
        deletedAt: new Date().toISOString(),
        originalPath: filePath
      };
      
      // 백업 파일로 이동 (완전 삭제가 아닌 백업)
      const backupPath = path.join(deletedDir, `${Date.now()}_${filename}`);
      const logPath = path.join(deletedDir, `${Date.now()}_${filename.replace('.txt', '.log.json')}`);
      
      // 파일을 백업 위치로 이동
      fs.copyFileSync(filePath, backupPath);
      fs.writeFileSync(logPath, JSON.stringify(deleteLog, null, 2));
      
      // 원본 파일 삭제
      fs.unlinkSync(filePath);
      
      // 관련 평가 파일도 삭제 (있다면)
      const evaluationPath = path.join(this.evaluationsDir, `${category}_${filename.replace('.txt', '.json')}`);
      if (fs.existsSync(evaluationPath)) {
        fs.unlinkSync(evaluationPath);
      }
      
      console.log(`✅ 파일 삭제 및 백업 완료: ${filename} -> ${backupPath}`);
      return true;
      
    } catch (error) {
      console.error(`❌ 파일 삭제 중 오류: ${error.message}`);
      return false;
    }
  }
}

module.exports = ClassificationManager;