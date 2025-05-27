#!/usr/bin/env node

const inquirer = require('inquirer');
const ClassificationManager = require('../lib/classificationManager');

class ClassificationCLI {
  constructor() {
    this.manager = new ClassificationManager();
  }

  async start() {
    console.log('\n🎯 Claude 분류 결과 평가 시스템');
    console.log('=' .repeat(50));

    while (true) {
      const action = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '원하는 작업을 선택하세요:',
          choices: [
            { name: '📝 미평가 항목 평가하기', value: 'evaluate' },
            { name: '📊 평가 통계 보기', value: 'stats' },
            { name: '❌ 낮은 점수 항목 보기', value: 'lowrated' },
            { name: '📈 카테고리별 현황', value: 'status' },
            { name: '🚪 종료', value: 'exit' }
          ]
        }
      ]);

      switch (action.action) {
        case 'evaluate':
          await this.evaluateItems();
          break;
        case 'stats':
          await this.showStats();
          break;
        case 'lowrated':
          await this.showLowRated();
          break;
        case 'status':
          await this.showStatus();
          break;
        case 'exit':
          console.log('\n👋 평가 시스템을 종료합니다.');
          return;
      }
    }
  }

  async evaluateItems() {
    const unrated = this.manager.getUnratedClassifications();
    const allItems = [];

    // 모든 미평가 항목을 하나의 배열로 합치기
    for (const [category, items] of Object.entries(unrated)) {
      items.forEach(item => {
        allItems.push({ ...item, category });
      });
    }

    if (allItems.length === 0) {
      console.log('\n✅ 모든 항목이 평가되었습니다!');
      return;
    }

    console.log(`\n📝 총 ${allItems.length}개의 미평가 항목이 있습니다.`);

    const startEvaluation = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'start',
        message: '평가를 시작하시겠습니까?',
        default: true
      }
    ]);

    if (!startEvaluation.start) return;

    let evaluated = 0;
    for (const item of allItems) {
      console.log('\n' + '='.repeat(60));
      console.log(`📂 카테고리: ${item.category.toUpperCase()}`);
      console.log(`📄 파일: ${item.filename}`);
      console.log('\n🤖 Claude 분류 결과:');
      console.log('-'.repeat(40));
      console.log(item.classification);
      console.log('\n📝 원본 내용:');
      console.log('-'.repeat(40));
      console.log(item.content.substring(0, 200) + (item.content.length > 200 ? '...' : ''));

      const evaluation = await inquirer.prompt([
        {
          type: 'list',
          name: 'rating',
          message: '이 분류 결과를 평가해주세요:',
          choices: [
            { name: '⭐ 1점 - 매우 부정확', value: 1 },
            { name: '⭐⭐ 2점 - 부정확', value: 2 },
            { name: '⭐⭐⭐ 3점 - 보통', value: 3 },
            { name: '⭐⭐⭐⭐ 4점 - 정확함', value: 4 },
            { name: '⭐⭐⭐⭐⭐ 5점 - 매우 정확함', value: 5 }
          ]
        },
        {
          type: 'input',
          name: 'feedback',
          message: '피드백 (선택사항):',
          when: (answers) => answers.rating <= 3
        },
        {
          type: 'input',
          name: 'improvements',
          message: '개선 사항 (선택사항):',
          when: (answers) => answers.rating <= 3
        },
        {
          type: 'confirm',
          name: 'continue',
          message: '다음 항목을 계속 평가하시겠습니까?',
          default: true
        }
      ]);

      this.manager.saveEvaluation(
        item.category,
        item.filename,
        evaluation.rating,
        evaluation.feedback || '',
        evaluation.improvements || ''
      );

      evaluated++;

      if (evaluation.rating >= 4) {
        console.log('✅ 높은 점수로 인해 claude_approved 폴더로 이동되었습니다!');
      }

      if (!evaluation.continue) {
        break;
      }
    }

    console.log(`\n🎉 총 ${evaluated}개 항목을 평가했습니다!`);
  }

  async showStats() {
    const stats = this.manager.getEvaluationStats();

    console.log('\n📊 평가 통계');
    console.log('=' .repeat(30));
    console.log(`총 평가 수: ${stats.total}`);
    console.log(`평균 점수: ${stats.avgRating.toFixed(2)}/5`);
    console.log(`승인된 항목: ${stats.approved}개 (${((stats.approved / stats.total) * 100).toFixed(1)}%)`);

    console.log('\n📈 점수별 분포:');
    for (let i = 1; i <= 5; i++) {
      const count = stats.byRating[i];
      const percentage = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : 0;
      console.log(`${i}점: ${count}개 (${percentage}%)`);
    }

    if (Object.keys(stats.byCategory).length > 0) {
      console.log('\n📂 카테고리별 통계:');
      for (const [category, data] of Object.entries(stats.byCategory)) {
        console.log(`${category}: ${data.count}개, 평균 ${data.avgRating.toFixed(2)}점`);
      }
    }

    await inquirer.prompt([{ type: 'input', name: 'continue', message: '엔터를 눌러 계속...' }]);
  }

  async showLowRated() {
    const lowRated = this.manager.getLowRatedItems(2);

    if (lowRated.length === 0) {
      console.log('\n✅ 낮은 점수(2점 이하)를 받은 항목이 없습니다!');
      return;
    }

    console.log(`\n❌ 낮은 점수를 받은 항목들 (총 ${lowRated.length}개)`);
    console.log('=' .repeat(50));

    lowRated.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.category}/${item.filename} - ${item.rating}점`);
      if (item.feedback) {
        console.log(`   피드백: ${item.feedback}`);
      }
      if (item.improvements) {
        console.log(`   개선사항: ${item.improvements}`);
      }
    });

    await inquirer.prompt([{ type: 'input', name: 'continue', message: '엔터를 눌러 계속...' }]);
  }

  async showStatus() {
    console.log('\n📈 카테고리별 현황');
    console.log('=' .repeat(40));

    const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
    
    for (const category of categories) {
      const unratedCount = this.manager.getUnratedCount(category);
      console.log(`${category.padEnd(15)}: 미평가 ${unratedCount}개`);
    }

    const totalUnrated = this.manager.getUnratedCount();
    console.log(`\n전체 미평가: ${totalUnrated}개`);

    await inquirer.prompt([{ type: 'input', name: 'continue', message: '엔터를 눌러 계속...' }]);
  }
}

// CLI 실행
if (require.main === module) {
  const cli = new ClassificationCLI();
  cli.start().catch(console.error);
}

module.exports = ClassificationCLI;