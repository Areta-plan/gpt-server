// 재구성 메서드 테스트 스크립트
const AutoClassificationManager = require('./lib/autoClassificationManager');

async function testReconstruction() {
  const manager = new AutoClassificationManager();
  
  console.log('🔧 재구성 메서드 테스트\n');
  
  // 1. Title 재구성 테스트
  console.log('1. Title 재구성 테스트:');
  const titleClassification = "부산 인지행동치료 ABA, 이거 고민되시는 분들만 보세요";
  const titleOriginal = "부산 인지행동치료 ABA 와 고민되시는 분들만 보세요";
  const titleFormat = manager.categoryFormats.title;
  
  const titleResult = manager.reconstructFromClassification('title', titleClassification, titleOriginal, titleFormat);
  console.log('✅ Title 결과:');
  console.log(titleResult);
  console.log('');
  
  // 2. Closing 재구성 테스트
  console.log('2. Closing 재구성 테스트:');
  const closingClassification = "[진정성 있는], [차분한], [신뢰 형성]";
  const closingOriginal = "하늘땅만큼 소중한 우리 아이의 센터는 정말 세심하고 신중하게 골라야 합니다. 그러니 꼭 여러 글을 둘러보시고 결정하시길 바랄게요.만약 연락을 주시면 20000회기 실치료를 진행한 15년 차 전문가인 제가 직접 한 분 한 분 정성스럽게 응대해 드리고 있는데요.현재 많은 분들의 연락으로 인해 대기가 발생할 수도 있습니다. 다만, 순차적으로 답장해 드리고 있다는 점, 양해 부탁드리겠습니다.이지언어행동발달센터 이지영 원장이었습니다. 긴 글 읽어주셔서 감사합니다.";
  const closingFormat = manager.categoryFormats.closing;
  
  const closingResult = manager.reconstructFromClassification('closing', closingClassification, closingOriginal, closingFormat);
  console.log('✅ Closing 결과:');
  console.log(closingResult);
  console.log('');
  
  // 3. 잘못된 형식 재구성 테스트 (기존 ti_014.txt 같은 케이스)
  console.log('3. 잘못된 형식 재구성 테스트:');
  const badFormatClassification = `===user===
부산 인지행동치료 ABA, 이 글을 클릭하신 분들은 아마도 두 가지 치료법 중 하나를 선택해야 하는 상황일 거라 생각합니다. 하지만 어떤 것을 선택해야 할지 고민이 많으실 것 같아요.

그래서 오늘은 14년차 전문가인 제가 두 치료법의 차이점과 각각의 장단점을 솔직하게 말씀드리려고 합니다. 이 글을 읽으신다면 어떤 치료를 선택해야 할지 분명히 답이 보이실 거예요.

부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
부산 인지행동치료 ABA, 고민되시는 분들만 보세요
===assistant===
부산 인지행동치료 ABA 와 고민되시는 분들만 보세요`;
  
  const badFormatResult = manager.reconstructFromInvalidFormat('title', badFormatClassification, titleOriginal, titleFormat);
  console.log('✅ 잘못된 형식 재구성 결과:');
  console.log(badFormatResult);
  console.log('');
  
  console.log('🔧 재구성 테스트 완료!');
}

testReconstruction().catch(console.error);