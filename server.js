const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();


const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const STRUCTURED_MODEL = process.env.GROQ_STRUCTURED_MODEL || "openai/gpt-oss-20b";
const publicDir = __dirname;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

function ensureApiKey() {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error(
      "Missing GROQ_API_KEY. Add it to your .env file before using the AI features."
    );
    error.statusCode = 500;
    throw error;
  }
}

function getApiKey() {
  ensureApiKey();
  return process.env.GROQ_API_KEY;
}

function validateResult(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  const requiredInputKeys = [
    "carKm",
    "bikeKm",
    "publicTransportKm",
    "flightsPerYear",
    "electricityKwh",
    "dietType",
    "wasteKg",
    "shoppingFrequency",
    "waterUsage",
  ];

  return requiredInputKeys.every((key) => key in (result.input || {}));
}

function extractJsonObject(text) {
  const source = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = source.indexOf("{");
  if (firstBrace === -1) {
    return source;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(firstBrace, index + 1);
      }
    }
  }

  return source;
}

function safeJsonParse(text) {
  return JSON.parse(extractJsonObject(text));
}

function ensureStringArray(value, minItems = 0) {
  const items = Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  return items.length >= minItems ? items : [];
}

function normalizeSuggestionsPayload(payload) {
  const suggestions = ensureStringArray(
    payload?.suggestions || payload?.tips || payload?.recommendations,
    1
  );

  if (!suggestions.length) {
    const error = new Error("The AI response did not include usable suggestions.");
    error.statusCode = 502;
    throw error;
  }

  return {
    suggestions: suggestions.slice(0, 5),
  };
}

function normalizeReportPayload(payload) {
  const summary = String(
    payload?.summary || payload?.overview || payload?.reportSummary || ""
  ).trim();
  const majorSources = ensureStringArray(
    payload?.majorSources || payload?.majorEmissionSources || payload?.emissionSources,
    1
  );
  const actionableImprovements = ensureStringArray(
    payload?.actionableImprovements || payload?.improvements || payload?.recommendations,
    1
  );

  if (!summary || !majorSources.length || !actionableImprovements.length) {
    const error = new Error(
      "The AI report came back in an unexpected format. Please try again."
    );
    error.statusCode = 502;
    throw error;
  }

  return {
    summary,
    majorSources: majorSources.slice(0, 5),
    actionableImprovements: actionableImprovements.slice(0, 6),
  };
}

function formatKg(value) {
  return `${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)} kg CO2/year`;
}

function buildResultContext(result) {
  const breakdownLines = Object.entries(result.breakdown || {})
    .map(([key, value]) => `- ${key}: ${formatKg(value)}`)
    .join("\n");

  return `
Carbon footprint summary:
- Total annual footprint: ${formatKg(result.total)}
- Transport data: ${result.input.carKm} km/week by car, ${result.input.bikeKm} km/week by bike, ${result.input.publicTransportKm} km/week by public transport, ${result.input.flightsPerYear} flights/year
- Home energy: ${result.input.electricityKwh} kWh/month electricity
- Food and waste: diet=${result.input.dietType}, waste=${result.input.wasteKg} kg/week
- Lifestyle: shopping=${result.input.shoppingFrequency}, water=${result.input.waterUsage}

Emission breakdown:
${breakdownLines}
`.trim();
}

async function createStructuredResponse({ systemPrompt, userPrompt, schemaName, schema }) {
  const responseText = await callGroq({
    model: STRUCTURED_MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.3,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    },
  });

  return safeJsonParse(responseText);
}

async function createTextResponse({ systemPrompt, userPrompt }) {
  return callGroq({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.4,
  });
}

async function callGroq({ model = MODEL, messages, temperature = 0.4, responseFormat }) {
  const apiKey = getApiKey();
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      temperature,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message || "Groq request failed while processing the AI feature.";
    const error = new Error(message);
    error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 500;
    throw error;
  }

  const text = String(data?.choices?.[0]?.message?.content || "").trim();

  if (!text) {
    const error = new Error("Groq returned an empty response.");
    error.statusCode = 502;
    throw error;
  }

  return text;
}

app.post("/ai-suggestions", async (req, res, next) => {
  try {
    const { result } = req.body || {};

    if (!validateResult(result)) {
      return res.status(400).json({
        error: "A valid carbon footprint result is required.",
      });
    }

    const payload = normalizeSuggestionsPayload(
      await createStructuredResponse({
      systemPrompt:
        "You are a sustainability coach. Return concise, personalized, realistic carbon reduction advice based only on the user's footprint profile. Avoid generic filler and do not mention that you are an AI.",
      userPrompt: `${buildResultContext(
        result
      )}\n\nReturn 5 personalized suggestions. Each suggestion should be practical, specific, and easy to understand.`,
      schemaName: "carbon_suggestions",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          suggestions: {
            type: "array",
            minItems: 4,
            maxItems: 5,
            items: {
              type: "string",
            },
          },
        },
        required: ["suggestions"],
      },
      })
    );

    res.json({
      suggestions: payload.suggestions,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/ai-report", async (req, res, next) => {
  try {
    const { result } = req.body || {};

    if (!validateResult(result)) {
      return res.status(400).json({
        error: "A valid carbon footprint result is required.",
      });
    }

    const payload = normalizeReportPayload(
      await createStructuredResponse({
      systemPrompt:
        "You are an expert sustainability analyst. Produce a clear, supportive report that highlights the user's biggest emissions sources and the best opportunities to improve them.",
      userPrompt: `${buildResultContext(
        result
      )}\n\nCreate a detailed report with a short summary, the major emission sources, and actionable improvements.`,
      schemaName: "carbon_report",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: {
            type: "string",
          },
          majorSources: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: {
              type: "string",
            },
          },
          actionableImprovements: {
            type: "array",
            minItems: 3,
            maxItems: 6,
            items: {
              type: "string",
            },
          },
        },
        required: ["summary", "majorSources", "actionableImprovements"],
      },
      })
    );

    res.json({
      report: payload,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/chat", async (req, res, next) => {
  try {
    const { messages, result } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "A chat history is required.",
      });
    }

    const recentMessages = messages.slice(-10).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "").trim(),
    }));

    const transcript = recentMessages
      .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
      .join("\n");

    const userPromptParts = [
      "Answer the user's sustainability question in a clean, readable way.",
      "Keep the answer practical and easy to apply.",
      validateResult(result)
        ? `${buildResultContext(result)}`
        : "No carbon result is available yet, so answer generally.",
      `Conversation:\n${transcript}`,
    ];

    const answer = await createTextResponse({
      systemPrompt:
        "You are EcoTrack's sustainability assistant. Give accurate, supportive answers about personal carbon footprints, energy use, food, transport, waste, and eco-friendly habits. If the user asks for something unrelated, gently steer back to sustainability.",
      userPrompt: userPromptParts.join("\n\n"),
    });

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500
      ? error.message || "Something went wrong while processing the AI request."
      : error.message;

  console.error(error);
  res.status(statusCode).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`EcoTrack server running on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn(
      "GROQ_API_KEY is not set. The calculator UI will load, but AI features will stay unavailable until you add the key to a .env file or your environment."
    );
  }
});
