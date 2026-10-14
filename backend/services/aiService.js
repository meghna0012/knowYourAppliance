export const askApplianceQuestion = async ({ brand, modelNumber, question, nickname, context }) => {
  const client = getClient();

  const prompt = `
Appliance brand: ${brand}
Model number: ${modelNumber}
Type: ${nickname}

Reference information (may be partial or empty):
"""
${context || "None provided."}
"""

User's question: "${question}"

You are a STRICT appliance support assistant.
Answer ONLY using the reference information above. If it doesn't contain the answer, reply exactly:
"I can't confirm this from the available information."

RULES:
- Max 50 words. Usually 1-2 sentences.
- Troubleshooting: max 3 short steps.
- No intros, summaries, tables, or extra tips — answer only what was asked.
- Never invent specs, buttons, error codes, or procedures not in the reference.
- Safety issues (fire, smoke, gas, sparks, shock, overheating) always come first: tell the user to stop use and seek professional help, regardless of reference content.

Priority: SAFETY > VERIFIED FACTS > DIRECT ANSWER > BREVITY.
`;

  const completion = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3, // lower = more consistent, less rambling
    max_tokens: 150,  // hard cap so it can't ramble even if it tries
  });

  return completion.choices[0].message.content.trim();
};