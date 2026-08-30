import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PORT = process.env.PORT || 3000;

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

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Tooiicy Agent',
      version: '1.0.0',
      endpoints: {
        chat: 'POST /chat',
        product: 'GET /product',
        health: 'GET /health',
      },
    }));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'GET' && req.url === '/product') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(PRODUCT_INFO));
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { message, history = [] } = JSON.parse(body);

        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'message field is required' }));
          return;
        }

        const messages = [
          ...history,
          { role: 'user', content: message },
        ];

        const response = await client.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        });

        const assistantMessage = response.content[0].type === 'text' ? response.content[0].text : '';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          reply: assistantMessage,
          history: [
            ...messages,
            { role: 'assistant', content: assistantMessage },
          ],
        }));
      } catch (error) {
        console.error('Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Tooiicy Agent server running on port ${PORT}`);
});
