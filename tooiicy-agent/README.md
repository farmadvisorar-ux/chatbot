# Tooiicy Antigravity Agent

A Claude-powered customer support agent for the Tooiicy merchandise store, built for Google Antigravity.

## Features

- Answer questions about the "I Hope The Worst Tee" product
- Help customers with sizing decisions
- Provide care and shipping information
- Multi-turn conversations with memory
- Friendly, brand-aligned responses

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set your Anthropic API key:
```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

3. Run the agent:
```bash
npm start
```

## Deployment on Antigravity

### Option 1: Desktop App
Copy the agent files to your Antigravity workspace and run directly.

### Option 2: CLI
```bash
antigravity deploy --name tooiicy-agent --source .
```

### Option 3: Managed Agents (Gemini API)
Create a managed agent endpoint in Google Cloud Console pointing to this codebase.

### Option 4: Custom Integration
Integrate with your Vercel storefront:

```javascript
const response = await fetch('https://your-antigravity-endpoint.com/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: userMessage })
});
const { reply } = await response.json();
```

## Product Information

Single product: "I Hope The Worst Tee"
- Price: $35.00 USD
- Sizes: S, M, L, XL, 2XL (oversized, size down for regular fit)
- Color: Washed black
- Design: Oversized boxy tee with stacked "I HOPE THE WORST" text
- Shipping from: Dallas, Texas
- Designer: Jimarri Wells (Juicecuzz)

## Environment Variables

- `ANTHROPIC_API_KEY` - Your Claude API key (required)

## License

Private. Part of the Tooiicy merchandise platform.
