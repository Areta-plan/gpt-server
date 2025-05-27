const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const systemPrompt = fs.readFileSync(
  path.resolve(__dirname, '../system_prompts/first_paragraph_system.txt'),
  'utf8'
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function sendFirstParagraphChat(userContent) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const completion = await openai.chat.completions.create({
    model: '<YOUR_FINE_TUNED_MODEL>',
    messages
  });

  return completion.choices[0].message.content;
}

module.exports = { sendFirstParagraphChat };