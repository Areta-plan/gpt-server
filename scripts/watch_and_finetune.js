require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const chokidar = require('chokidar');
const simpleGit = require('simple-git');

const repoDir = path.resolve(__dirname, '..');
const git = simpleGit(repoDir);

// 자동 Git 동기화 비활성화
// 사용자가 수동으로 commit/push/pull 수행
// cron.schedule('*/5 * * * *', async () => {
//   try {
//     console.log('🔄 주기적 pull 시작…');
//     await git.pull(process.env.GITHUB_REMOTE || 'origin', process.env.GITHUB_BRANCH || 'master');
//     console.log('✅ 원격 변경사항 로컬 반영 완료');
//   } catch (e) {
//     console.error('❌ pull 실패:', e.message);
//   }
// });

// OpenAI SDK v4 (CommonJS) 사용
let openai;

const SAMPLES_DIR = path.resolve(__dirname, '../training_examples');
const JSONL_PATH = path.resolve(__dirname, '../training_data.jsonl');
const TRAINING_DIR = path.resolve(__dirname, '../training_data');
const LATEST_PATH = path.resolve(__dirname, '../latest_model.txt');
// Fine-tuning now requires an explicit model version.
// The 0125 release is generally available for fine-tuning.
const BASE_MODEL = 'gpt-3.5-turbo-0125';
const SUFFIX = 'auto';

// Git 동기화를 위한 함수
async function syncGit() {
  const {
    GITHUB_TOKEN,
    GITHUB_REPO,
    GITHUB_REMOTE = 'origin',
    GITHUB_BRANCH = 'main'
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.error('🔧 Git 동기화 건너뜀: GITHUB_TOKEN 또는 GITHUB_REPO가 설정되지 않았습니다.');
    return;
  }

  const repoDir = path.resolve(__dirname, '..');
  const git = simpleGit(repoDir);
  const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}`;

  try {
    // 원격 재설정
    await git.removeRemote(GITHUB_REMOTE).catch(() => {});
    await git.addRemote(GITHUB_REMOTE, remoteUrl);

    // 변경사항 커밋
    await git.add('.');
    const commitMsg = `🔄 chore: codex auto-sync @ ${new Date().toISOString()}`;
    await git.commit(commitMsg);

    // Pull & Rebase
    await git.pull(GITHUB_REMOTE, GITHUB_BRANCH, { '--rebase': 'true' });

    // Push
    await git.push(GITHUB_REMOTE, GITHUB_BRANCH);

    console.log('✅ Codex → GitHub 동기화 완료');
  } catch (e) {
    console.error('❌ Git 동기화 실패:', e);
  }
}

// 1) 샘플 파일을 JSONL로 변환
function buildJsonl() {
  const records = [];
  function parseConversation(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    const messages = [];
    let role = null;
    let buffer = [];
    const pushBuffer = () => {
      if (role && buffer.length) {
        const content = buffer.join('\n').trim();
        if (content) messages.push({ role, content });
      }
      buffer = [];
    };
    for (const line of lines) {
      const m = line.match(/^===(system|user|assistant)===/i);
      if (m) {
        pushBuffer();
        role = m[1].toLowerCase();
      } else {
        buffer.push(line);
      }
    }
    pushBuffer();
    if (!messages.length) {
      const prompt = (lines.shift() || '').trim();
      const completion = lines.join('\n').trim();
      if (prompt && completion) {
        return { messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: completion }
        ] };
      }
      return null;
    }
    const hasUser = messages.some(m => m.role === 'user');
    const hasAssistant = messages.some(m => m.role === 'assistant');
    return hasUser && hasAssistant ? { messages } : null;
  }

  function traverse(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        traverse(full);
      } else if (entry.name.endsWith('_prompt.txt')) {
        const id = entry.name.replace('_prompt.txt', '');
        const promptPath = path.join(dir, `${id}_prompt.txt`);
        const completionPath = path.join(dir, `${id}_completion.txt`);
        if (fs.existsSync(completionPath)) {
          const prompt = fs.readFileSync(promptPath, 'utf8').trim();
          const completion = fs.readFileSync(completionPath, 'utf8').trim();
          records.push({
            messages: [
              { role: 'user', content: prompt },
              { role: 'assistant', content: completion }
            ]
          });
        }
      } else if (entry.name.endsWith('.txt')) {
        const conv = parseConversation(full);
        if (conv) records.push(conv);
      }
    });
  }
  traverse(SAMPLES_DIR);
  const jsonl = records.map(o => JSON.stringify(o)).join('\n') + '\n';
  fs.writeFileSync(JSONL_PATH, jsonl, 'utf8');
  console.log(`✅ JSONL (${records.length} samples) written to ${JSONL_PATH}`);
  
  splitJsonl();
}

// 보조: training_data.jsonl을 분할하여 섹션별 JSONL 저장
function splitJsonl() {
  if (!fs.existsSync(TRAINING_DIR)) {
    fs.mkdirSync(TRAINING_DIR, { recursive: true });
  }

  const mapping = {
    title: { dir: 'title', prompt: '다음에 대한 타이틀을 작성해줘' },
    first_paragraph: { dir: 'firstparagraph', prompt: '다음에 대한 첫 문단을 작성해줘' },
    closing: { dir: 'closing', prompt: '다음 내용을 감정적으로 마무리해줘' }
  };

  for (const [section, info] of Object.entries(mapping)) {
    const sectionDir = path.join(SAMPLES_DIR, info.dir);
    const records = [];
    if (fs.existsSync(sectionDir)) {
      const files = fs.readdirSync(sectionDir).filter(f => f.endsWith('.txt'));
      for (const file of files) {
        const full = path.join(sectionDir, file);
        let text = fs.readFileSync(full, 'utf8');
        const idx = text.indexOf('===assistant===');
        if (idx >= 0) {
          text = text.substring(idx + '===assistant==='.length);
        }
        text = text.trim();
        if (!text) continue;
        records.push({
          messages: [
            { role: 'user', content: info.prompt },
            { role: 'assistant', content: text }
          ]
        });
      }
    }
    const jsonl = records.map(r => JSON.stringify(r)).join('\n');
    const outPath = path.join(TRAINING_DIR, `${section}_samples.jsonl`);
    fs.writeFileSync(outPath, jsonl + (records.length ? '\n' : ''), 'utf8');
  }

  console.log(`✅ Section JSONL files written to ${TRAINING_DIR}`);
}

// 2) 파일 업로드 및 파인튜닝 실행
async function runFineTune() {
  if (!openai) {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('openai.files.create exists:', typeof openai.files?.create === 'function');
    console.log('openai.fineTuning.jobs.create exists:', typeof openai.fineTuning?.jobs?.create === 'function');
    console.log('openai.fineTuning.jobs.retrieve exists:', typeof openai.fineTuning?.jobs?.retrieve === 'function');
  }
  if (typeof openai.files?.create !== 'function' ||
      typeof openai.fineTuning?.jobs?.create !== 'function' ||
      typeof openai.fineTuning?.jobs?.retrieve !== 'function') {
    console.error('Error: required OpenAI methods are not available');
    process.exit(1);
  }
  try {
    console.log('➡️ Uploading training file…');
    const fileRes = await openai.files.create({
      file: fs.createReadStream(JSONL_PATH),
      purpose: 'fine-tune',
    });
    const fileId = fileRes.id;
    console.log(`✅ File uploaded. ID: ${fileId}`);

    console.log('➡️ Creating fine-tune job…');
    const ftRes = await openai.fineTuning.jobs.create({
      training_file: fileId,
      model: BASE_MODEL,
      suffix: SUFFIX,
    });
    const job = ftRes;
    console.log(`▶ Job created. ID: ${job.id}, status: ${job.status}`);

    let status = job.status;
    while (status !== 'succeeded' && status !== 'failed') {
      await new Promise(r => setTimeout(r, 30000));
      const info = await openai.fineTuning.jobs.retrieve(job.id);
      status = info.status;
      console.log(`… current status: ${status}`);
    }

    if (status === 'succeeded') {
      const detail = await openai.fineTuning.jobs.retrieve(job.id);
      const fineModel = detail.fine_tuned_model;
      fs.writeFileSync(LATEST_PATH, fineModel, 'utf8');
      console.log(`✅ Fine-tune complete. New model: ${fineModel}`);
    } else {
      console.error('❌ Fine-tune failed');
      try {
        const events = await openai.fineTuning.jobs.listEvents(job.id, { limit: 5 });
        for await (const ev of events) {
          console.log(`⚠️ ${ev.level}: ${ev.message}`);
        }
      } catch (e) {
        console.error('Failed to fetch job events:', e);
      }
    }
  } catch (err) {
    console.error('runFineTune error:', err);
  }
}

// 3) training_samples 폴더 변경 감시 및 자동 실행
if (require.main === module) {
  if (process.argv.includes('build') || process.argv.includes('--build')) {
    buildJsonl();
    process.exit(0);
  }

  console.log(`🔍 Watching ${SAMPLES_DIR} for changes…`);
  const watcher = chokidar.watch(SAMPLES_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: true
  });
  let debounceTimer;
  function onChange(filePath) {
    console.log(`📄 Change detected: ${filePath}`);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      buildJsonl();
      await runFineTune();
      // 자동 Git 동기화 비활성화
      // await syncGit();
      console.log('✅ 파인튤닝 완료. Git 커밋은 수동으로 수행하세요.');
    }, 5000);
  }
  watcher.on('add', onChange).on('change', onChange).on('unlink', onChange);
}

module.exports = { buildJsonl, runFineTune, syncGit };
