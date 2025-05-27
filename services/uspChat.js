const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const systemPrompt = fs.readFileSync(
  path.resolve(__dirname, '../system_prompts/usp_system.txt'),
  'utf8'
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function sendUspChat(userContent) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const completion = await openai.chat.completions.create({
    model: '<YOUR_FINE_TUNED_MODEL>',
    messages,
    max_tokens: 800,
    temperature: 0.7
  });

  return completion.choices[0].message.content;
}

module.exports = { sendUspChat };