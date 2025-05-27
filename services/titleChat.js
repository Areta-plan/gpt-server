import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const systemPrompt = fs.readFileSync(
  path.resolve(__dirname, '../system_prompts/title_system.txt'),
  'utf8'
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function sendTitleChat(userContent) {
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