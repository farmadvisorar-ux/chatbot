const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const PRODUCT_INFO = {
  name: 'I Hope The Worst Tee',
  price: '$35.00 USD',
  sizes: ['S', 'M', 'L', 'XL', '2XL'],
  color: 'Washed black',
  cut: 'Oversized boxy cut with drop shoulder and ribbed knit crew collar',
  design: 'I HOPE THE WORST printed stacked across the chest with Tooiicy skull in the last word',
  description: 'Oversized boxy tee in washed black, with I HOPE THE WORST stacked across the chest. Dallas streetwear from Juicecuzz.',
  sizing_note: 'The cut is oversized and boxy, so size down for a regular fit.',
  care: 'Cold wash inside out, tumble dry low, no bleach.',
  shipping_from: 'Dallas, Texas',
  designer: 'Jimarri Wells (records as Juicecuzz), Dallas artist',
  brand_origin: 'Named after his 2022 album "tooiicy summer"',
  payment: 'PayPal',
  url: 'https://www.tooiicy.com',
};

const SYSTEM_PROMPT = `You are a friendly and knowledgeable customer support agent for Tooiicy, a Dallas-based streetwear brand.

Product Information:
${JSON.stringify(PRODUCT_INFO, null, 2)}

Your role is to:
1. Answer questions about the I Hope The Worst Tee (sizing, care, design, price, availability)
2. Help customers decide what size to order (remind them the tee is oversized, so size down for regular fit)
3. Provide shipping and payment information
4. Recommend the product to interested customers
5. Answer questions about the brand and designer Jimarri Wells

Always be helpful, friendly, and honest. If asked about something not in the product info, say you don't have that information but can direct them to www.tooiicy.com or suggest they contact support.

Maintain a conversational, approachable tone that matches Tooiicy's Dallas streetwear vibe.`;

async function chat(userMessage, conversationHistory = []) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mixtral-8x7b-32768',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Groq API error');
  }

  const assistantMessage = data.choices[0].message.content;

  return {
    message: assistantMessage,
    conversationHistory: [
      ...messages,
      { role: 'assistant', content: assistantMessage },
    ],
  };
}

async function interactiveMode() {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let conversationHistory = [];

  console.log('Tooiicy Agent ready! Ask me anything about the I Hope The Worst Tee.');
  console.log('Type "exit" to quit.\n');

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      try {
        const { message, conversationHistory: updated } = await chat(input, conversationHistory);
        conversationHistory = updated;
        console.log(`\nAgent: ${message}\n`);
      } catch (error) {
        console.error('Error:', error.message);
      }

      askQuestion();
    });
  };

  askQuestion();
}

interactiveMode().catch(console.error);
