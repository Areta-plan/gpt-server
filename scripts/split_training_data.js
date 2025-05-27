const fs = require('fs');
const path = require('path');

const JSONL_PATH = path.resolve(__dirname, '../training_data.jsonl');
const TRAINING_DIR = path.resolve(__dirname, '../training_data');

if (!fs.existsSync(TRAINING_DIR)) fs.mkdirSync(TRAINING_DIR, { recursive: true });

const lines = fs.readFileSync(JSONL_PATH, 'utf8').trim().split('\n').filter(Boolean);

const titlePairs = [];
const firstPairs = [];
const closingPairs = [];

for (const line of lines) {
  const obj = JSON.parse(line);
  const messages = Array.isArray(obj.messages) ? obj.messages : [];
  const userMsg = messages.find(m => m.role === 'user');
  const assistMsg = messages.find(m => m.role === 'assistant');
  const prompt = userMsg ? userMsg.content : '';
  const completion = assistMsg ? assistMsg.content.replace(/\r/g, '') : '';

  const titleMatch = completion.match(/1\. 5 Compelling Titles([\s\S]*?)2\./);
  const firstMatch = completion.match(/2\. First Paragraph(?:[^\n]*)?([\s\S]*?)3\./);
  const closingMatch = completion.match(/5\. Emotional\/Impactful Closing([\s\S]*)$/);

  if (titleMatch && titleMatch[1].trim()) {
    titlePairs.push({ prompt, completion: titleMatch[1].trim() });
  }
  if (firstMatch && firstMatch[1].trim()) {
    firstPairs.push({ prompt, completion: firstMatch[1].trim() });
  }
  if (closingMatch && closingMatch[1].trim()) {
    closingPairs.push({ prompt, completion: closingMatch[1].trim() });
  }
}

const toJsonl = arr => arr.map(o => JSON.stringify(o)).join('\n') + '\n';
fs.writeFileSync(path.join(TRAINING_DIR, 'title_samples.jsonl'), toJsonl(titlePairs));
fs.writeFileSync(path.join(TRAINING_DIR, 'first_paragraph_samples.jsonl'), toJsonl(firstPairs));
fs.writeFileSync(path.join(TRAINING_DIR, 'closing_samples.jsonl'), toJsonl(closingPairs));

console.log('Split complete');