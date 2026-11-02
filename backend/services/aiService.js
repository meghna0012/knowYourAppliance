import OpenAI from "openai";

let client;

const getClient = () => {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return client;
};

// Read inside the call. Module imports run before dotenv.config(), so a
// top-level process.env read would miss GROQ_VISION_MODEL.
const visionModel = () => process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

export class DiagnosisError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

export const askApplianceQuestion = async ({
  brand,
  modelNumber,
  question,
  nickname,
  serialNumber,
  generation,
  context,
}) => {
  const client = getClient();

  const identity = [
    `Appliance brand: ${brand}`,
    `Model number: ${modelNumber}`,
    nickname ? `Nickname: ${nickname}` : null,
    serialNumber ? `Serial number: ${serialNumber}` : null,
    generation ? `Generation: ${generation}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `${identity}

Facts read from the owner's uploads (stickers, manuals, bills, condition photos). May be partial or empty:
"""
${context || "None provided."}
"""

User's question: "${question}"

You are a concise appliance support assistant for this specific machine.
- Treat upload facts as verified. Do not contradict them. Prefer them when they answer the question.
- Purchase dates, warranty end dates, and maintenance due dates in those facts are the household's stored record. Use them for expiry, renewal, and service questions.
- If they don't contain the answer, answer from knowledge of this brand and model. If you are not sure of a spec, code, or procedure, say you can't confirm it.
- Max 50 words. Usually 1-2 sentences.
- Troubleshooting: max 3 short steps.
- No intros, summaries, tables, markdown, or extra tips — answer only what was asked.
- Never invent specs, buttons, error codes, or procedures.
- Safety issues (fire, smoke, gas, sparks, shock, overheating) always come first: tell the user to stop use and seek professional help.

Priority: SAFETY > UPLOAD FACTS > DIRECT ANSWER > BREVITY.
`;

  const completion = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 150,
  });

  return completion.choices[0].message.content.trim();
};

const DIAGNOSIS_SYSTEM = `You read one uploaded file for a home appliance assistant. The file may be a model or generation sticker, a photo of the appliance and its condition, a manual, a receipt or bill, a warranty card, a service invoice, or something else.

Reply with a single JSON object and nothing else. Use this shape:
{
  "kind": "sticker" | "manual" | "bill" | "warranty" | "service" | "condition" | "other",
  "confidence": "high" | "medium" | "low",
  "summary": string,
  "identification": {
    "brand": string | null,
    "modelNumber": string | null,
    "serialNumber": string | null,
    "generation": string | null,
    "applianceType": string | null
  },
  "bill": {
    "retailer": string | null,
    "purchaseDate": string | null,
    "price": string | null,
    "currency": string | null,
    "invoiceNumber": string | null,
    "warranty": string | null
  },
  "warranty": {
    "provider": string | null,
    "coverageType": "manufacturer" | "extended" | "retailer" | "unknown",
    "termMonths": number | null,
    "startDate": string | null,
    "endDate": string | null,
    "coverage": string | null,
    "renewable": boolean | null,
    "renewalDate": string | null
  },
  "maintenance": [
    {
      "task": string,
      "intervalMonths": number | null,
      "intervalDays": number | null,
      "lastDone": string | null,
      "nextDue": string | null
    }
  ],
  "condition": {
    "observations": string[],
    "issues": string[],
    "severity": "none" | "minor" | "moderate" | "urgent",
    "safeToUse": boolean | null,
    "advice": string | null
  },
  "manual": {
    "topic": string | null,
    "keyPoints": string[]
  },
  "excerpt": string | null,
  "unreadable": string[]
}

Rules:
- Pick the one kind that best matches the subject of the file. A repair or service invoice is "service", not "bill". A warranty card or certificate is "warranty". A purchase receipt is "bill".
- Identification may be filled for any kind when a nameplate, sticker, or document actually shows it.
- Copy brand, model, serial, and generation exactly as printed. Never guess a missing character. If you cannot read it, set it null and name the field in unreadable.
- confidence is low when the image is blurry, cropped, or you are unsure of a character.
- Dates are YYYY-MM-DD only when the calendar day is unambiguous. If a date is missing or unreadable, set it null and name it in unreadable. Never invent or calculate a date.
- Bills: only values you can read. purchaseDate is the day the appliance was bought, not a later repair. currency is a 3-letter code when the document shows one (INR, USD). bill.warranty is the warranty wording as printed, if any.
- Warranty: fill this whenever the file states a warranty, including a term printed on a bill. termMonths is always a count of months: 24 for a 2-year warranty, never 2. endDate and renewalDate only when that date is printed. renewable true only when the document says the cover can be renewed or continues by renewal. Do not calculate an end date from a term.
- Maintenance: only tasks the file itself schedules or records. From a manual, recurring care with its interval ("clean the filter every 2 weeks" is intervalDays 14; "annual service" is intervalMonths 12). Set only one of intervalDays or intervalMonths. lastDone is the date work was done on a service document. nextDue only when a next date is printed. Do not invent a schedule from general knowledge, and do not calculate nextDue.
- Manuals: keyPoints are only steps, warnings, or specs written in the file. Do not add advice from general knowledge.
- Condition: describe only what is visible. severity urgent and safeToUse false when you see fire, smoke, scorching, melting, sparks, a gas leak, exposed wiring, or anything that makes use dangerous. advice then tells the owner to stop using it and get professional help.
- excerpt is short text you can actually read (sticker lines, an error on a display, a warning). Null if there is nothing to quote. Do not transcribe a whole manual.
- Unrelated files: kind "other" and say so in the summary.
- summary is 1 to 3 sentences in plain language.`;

function diagnosisInstruction(appliance, pageNote) {
  const lines = ["Read this upload and return the JSON object."];
  if (appliance) {
    const nickname = appliance.nickname ? ` (${appliance.nickname})` : "";
    lines.push(
      `Household record for this file: ${appliance.brand} ${appliance.modelNumber}${nickname}. That record can be wrong. Report what the file shows.`
    );
  } else {
    lines.push("No appliance is selected yet. If this is a sticker or a bill, identification matters most.");
  }
  if (pageNote) lines.push(pageNote);
  return lines.join("\n");
}

function parseModelJson(raw) {
  let text = String(raw || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new DiagnosisError("The reader didn't return a result. Try that upload again.");
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new DiagnosisError("The reader didn't return a result. Try that upload again.");
  }
}

function asDiagnosisFailure(err) {
  if (err instanceof DiagnosisError) return err;
  console.error("diagnosis request failed", err.status || "", err.message);
  if (err.status === 429) {
    return new DiagnosisError("The reader is busy. Wait a minute and try again.", 429);
  }
  if (err.status === 400 || err.status === 413) {
    return new DiagnosisError("That file couldn't be sent to the reader. Try a smaller JPEG or PNG.", 422);
  }
  return new DiagnosisError("Couldn't read that upload. Try a clearer photo, or again in a moment.", 502);
}

export async function requestDiagnosis({ prepared, appliance }) {
  const instruction = diagnosisInstruction(appliance, prepared.pageNote);
  const content =
    prepared.mode === "text"
      ? `${instruction}\n\nDocument text:\n"""\n${prepared.text}\n"""`
      : [
          { type: "text", text: instruction },
          ...prepared.images.map((image) => ({
            type: "image_url",
            image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}` },
          })),
        ];

  try {
    const completion = await getClient().chat.completions.create({
      model: visionModel(),
      messages: [
        { role: "system", content: DIAGNOSIS_SYSTEM },
        { role: "user", content },
      ],
      temperature: 0.2,
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
    });

    const message = completion.choices[0]?.message;
    if (!message?.content) {
      throw new DiagnosisError("The reader didn't return a result. Try that upload again.");
    }
    return parseModelJson(message.content);
  } catch (err) {
    throw asDiagnosisFailure(err);
  }
}
