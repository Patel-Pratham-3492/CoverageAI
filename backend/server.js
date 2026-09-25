import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// ======================================================
// CONFIGURATION
// ======================================================

const app = express();

const PORT = process.env.PORT || 5000;

const DB_NAME = "insurance_rag";

const COLLECTION_NAME = "policy_chunks";
const QUESTIONS_COLLECTION_NAME = "questions";
const FEEDBACK_COLLECTION_NAME = "feedback";

const VECTOR_INDEX_NAME = "insurance_vector_index";

const EMBEDDING_MODEL = "gemini-embedding-001";

const CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ||
  "gemini-3.5-flash-lite";

const EMBEDDING_DIMENSIONS = 3072;

const NUM_CANDIDATES = 100;
const RETRIEVAL_LIMIT = 8;
const RELEVANCE_THRESHOLD = 0.35;

// ======================================================
// ENVIRONMENT VALIDATION
// ======================================================

const { MONGODB_URI, GEMINI_API_KEY } = process.env;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is missing from .env");
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing from .env");
  process.exit(1);
}

// ======================================================
// EXPRESS
// ======================================================

app.use(cors());

app.use(
  express.json({
    limit: "2mb",
  })
);

// ======================================================
// GEMINI
// ======================================================

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ======================================================
// MONGODB
// ======================================================

const mongoClient = new MongoClient(MONGODB_URI);

let collection = null;
let questionsCollection = null;
let feedbackCollection = null;

// ======================================================
// DATABASE INITIALIZATION
// ======================================================

async function initDb() {
  try {
    await mongoClient.connect();

    const db = mongoClient.db(DB_NAME);

    collection = db.collection(COLLECTION_NAME);

    questionsCollection = db.collection(
      QUESTIONS_COLLECTION_NAME
    );

    feedbackCollection = db.collection(
      FEEDBACK_COLLECTION_NAME
    );

    console.log("🔗 Connected to MongoDB Atlas");
    console.log(`🗄️ Database: ${DB_NAME}`);
    console.log(`📁 Policy collection: ${COLLECTION_NAME}`);
    console.log(
      `❓ Question collection: ${QUESTIONS_COLLECTION_NAME}`
    );
    console.log(
      `💬 Feedback collection: ${FEEDBACK_COLLECTION_NAME}`
    );

    // --------------------------------------------------
    // QUESTION INDEXES
    // --------------------------------------------------

    await questionsCollection.createIndex({
      created_at: -1,
    });

    await questionsCollection.createIndex({
      policy_name: 1,
    });

    // --------------------------------------------------
    // FEEDBACK INDEXES
    // --------------------------------------------------

    await feedbackCollection.createIndex({
      created_at: -1,
    });

    await feedbackCollection.createIndex({
      email: 1,
    });

    console.log("✅ MongoDB collections ready");
  } catch (error) {
    console.error(
      "❌ Failed to connect to MongoDB Atlas:",
      error
    );

    process.exit(1);
  }
}

// ======================================================
// SLEEP
// ======================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ======================================================
// GEMINI RETRY
// ======================================================

async function generateWithRetry(
  model,
  prompt,
  retries = 3,
  delayMs = 1000
) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      lastError = error;

      const status =
        error?.status ||
        error?.response?.status;

      const isTemporaryError =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504;

      if (!isTemporaryError || attempt === retries) {
        throw error;
      }

      console.warn(
        `⚠️ Gemini error ${status}. ` +
        `Retrying in ${delayMs}ms...`
      );

      await sleep(delayMs);

      delayMs *= 2;
    }
  }

  throw lastError;
}

// ======================================================
// GENERATE ANSWER
// ======================================================

async function generateAnswer(prompt) {
  console.log(`🤖 Asking Gemini: ${CHAT_MODEL}`);

  const model = genAI.getGenerativeModel({
    model: CHAT_MODEL,
  });

  const result = await generateWithRetry(
    model,
    prompt,
    3,
    1000
  );

  console.log(
    `✅ Answer generated using ${CHAT_MODEL}`
  );

  return {
    result,
    modelName: CHAT_MODEL,
  };
}

// ======================================================
// NORMALIZE POLICY NAME
// ======================================================

function normalizePolicyName(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");
}

// ======================================================
// GET POLICY NAME FROM DOCUMENT
// ======================================================

function getPolicyNameFromDocument(doc) {
  return (
    doc?.metadata?.policy_name ||
    doc?.policy_name ||
    doc?.metadata?.policy ||
    doc?.policy ||
    ""
  );
}

// ======================================================
// IS CASUAL MESSAGE
// ======================================================

function isCasualMessage(question) {
  const text = question
    .trim()
    .toLowerCase()
    .replace(/[!?.,]+$/g, "")
    .trim();

  const casualMessages = new Set([
    "hi",
    "hii",
    "hiii",
    "hello",
    "hey",
    "heyy",
    "good morning",
    "good afternoon",
    "good evening",
    "how are you",
    "how are you doing",
    "how's it going",
    "how is it going",
    "fine",
    "good",
    "great",
    "okay",
    "ok",
    "thanks",
    "thank you",
    "thankyou",
    "bye",
    "goodbye",
  ]);

  return casualMessages.has(text);
}

// ======================================================
// CASUAL RESPONSE
// ======================================================

function getCasualResponse(question) {
  const text = question.trim().toLowerCase();

  if (text === "bye" || text === "goodbye") {
    return "Goodbye! If you have a question about your insurance policy, feel free to ask.";
  }

  if (
    text === "thanks" ||
    text === "thank you" ||
    text === "thankyou"
  ) {
    return "You're welcome! Feel free to ask me anything about your insurance policy.";
  }

  return "Hello! I'm CoverageAI. You can ask me questions about your insurance policy, such as coverage, deductibles, copays, specialist visits, or out-of-pocket maximums.";
}

// ======================================================
// FIND ACTUAL POLICY NAME
// ======================================================

async function findActualPolicyName(requestedPolicy) {
  const cleanRequested = requestedPolicy.trim();

  const normalizedRequested =
    normalizePolicyName(cleanRequested);

  console.log(
    `🔎 Looking for policy: ${cleanRequested}`
  );

  // ----------------------------------------------------
  // EXACT METADATA MATCH
  // ----------------------------------------------------

  const exact = await collection.findOne({
    "metadata.policy_name": cleanRequested,
  });

  if (exact) {
    const actual = getPolicyNameFromDocument(exact);

    console.log(`✅ Exact policy found: ${actual}`);

    return actual;
  }

  // ----------------------------------------------------
  // EXACT ROOT FIELD MATCH
  // ----------------------------------------------------

  const exactRoot = await collection.findOne({
    policy_name: cleanRequested,
  });

  if (exactRoot) {
    const actual = getPolicyNameFromDocument(exactRoot);

    console.log(`✅ Exact root policy found: ${actual}`);

    return actual;
  }

  // ----------------------------------------------------
  // NORMALIZED / PARTIAL MATCH
  // ----------------------------------------------------

  const candidates = await collection
    .aggregate([
      {
        $project: {
          policy_name: "$metadata.policy_name",
          root_policy_name: "$policy_name",
        },
      },
      {
        $limit: 10000,
      },
    ])
    .toArray();

  const seen = new Set();

  for (const candidate of candidates) {
    const actual =
      candidate.policy_name ||
      candidate.root_policy_name ||
      "";

    if (!actual || seen.has(actual)) {
      continue;
    }

    seen.add(actual);

    const normalizedActual =
      normalizePolicyName(actual);

    if (normalizedActual === normalizedRequested) {
      console.log(
        `✅ Normalized policy match: ${actual}`
      );

      return actual;
    }

    if (
      normalizedActual.includes(normalizedRequested) ||
      normalizedRequested.includes(normalizedActual)
    ) {
      console.log(
        `✅ Partial policy match: ${actual}`
      );

      return actual;
    }
  }

  console.log(
    "⚠️ Could not map requested policy to stored policy name."
  );

  return null;
}

// ======================================================
// SEARCH POLICY CHUNKS
// ======================================================

async function searchPolicyChunks(
  queryVector,
  requestedPolicy
) {
  const actualPolicyName =
    await findActualPolicyName(requestedPolicy);

  console.log(
    `🏷️ Requested policy: ${requestedPolicy}`
  );

  console.log(
    `🏷️ Actual policy: ${
      actualPolicyName || "not resolved"
    }`
  );

  // ====================================================
  // SEARCH #1 — EXACT POLICY FILTER
  // ====================================================

  if (actualPolicyName) {
    try {
      console.log(
        "\n🔎 Vector search using exact policy..."
      );

      const pipeline = [
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: "embedding",
            queryVector,
            numCandidates: NUM_CANDIDATES,
            limit: RETRIEVAL_LIMIT,
            filter: {
              "metadata.policy_name": actualPolicyName,
            },
          },
        },
        {
          $project: {
            _id: 1,
            text: 1,
            metadata: 1,
            score: {
              $meta: "vectorSearchScore",
            },
          },
        },
      ];

      const docs = await collection
        .aggregate(pipeline)
        .toArray();

      console.log(
        `✅ Exact-policy search returned ${docs.length} chunks`
      );

      if (docs.length > 0) {
        return {
          docs,
          policyName: actualPolicyName,
        };
      }
    } catch (error) {
      console.error(
        "⚠️ Exact-policy vector search failed:"
      );

      console.error(error);
    }
  }

  // ====================================================
  // SEARCH #2 — FALLBACK VECTOR SEARCH
  // ====================================================

  console.log(
    "\n🔎 Running fallback vector search..."
  );

  const fallbackPipeline = [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector,
        numCandidates: NUM_CANDIDATES,
        limit: 30,
      },
    },
    {
      $project: {
        _id: 1,
        text: 1,
        metadata: 1,
        score: {
          $meta: "vectorSearchScore",
        },
      },
    },
  ];

  const fallbackDocs = await collection
    .aggregate(fallbackPipeline)
    .toArray();

  console.log(
    `✅ Fallback search returned ${fallbackDocs.length} chunks`
  );

  // ====================================================
  // FILTER FALLBACK RESULTS BY POLICY
  // ====================================================

  if (actualPolicyName) {
    const normalizedActual =
      normalizePolicyName(actualPolicyName);

    const filtered = fallbackDocs.filter((doc) => {
      const docPolicy =
        getPolicyNameFromDocument(doc);

      if (!docPolicy) {
        return false;
      }

      const normalizedDoc =
        normalizePolicyName(docPolicy);

      return (
        normalizedDoc === normalizedActual ||
        normalizedDoc.includes(normalizedActual) ||
        normalizedActual.includes(normalizedDoc)
      );
    });

    if (filtered.length > 0) {
      console.log(
        `✅ Fallback policy filtering returned ${filtered.length} chunks`
      );

      return {
        docs: filtered.slice(0, RETRIEVAL_LIMIT),
        policyName: actualPolicyName,
      };
    }
  }

  // ====================================================
  // APPROXIMATE POLICY MATCH
  // ====================================================

  const normalizedRequested =
    normalizePolicyName(requestedPolicy);

  const approximate = fallbackDocs.filter((doc) => {
    const docPolicy =
      getPolicyNameFromDocument(doc);

    if (!docPolicy) {
      return false;
    }

    const normalizedDoc =
      normalizePolicyName(docPolicy);

    return (
      normalizedDoc.includes(normalizedRequested) ||
      normalizedRequested.includes(normalizedDoc)
    );
  });

  if (approximate.length > 0) {
    console.log(
      `✅ Approximate policy filtering returned ${approximate.length} chunks`
    );

    return {
      docs: approximate.slice(
        0,
        RETRIEVAL_LIMIT
      ),
      policyName:
        getPolicyNameFromDocument(
          approximate[0]
        ),
    };
  }

  return {
    docs: [],
    policyName:
      actualPolicyName ||
      requestedPolicy,
  };
}

// ======================================================
// SAVE QUESTION
// ======================================================

async function saveQuestion({
  question,
  policy_name,
  answer,
  model,
  sources = [],
  provider_id = null,
}) {
  try {
    if (!questionsCollection) {
      throw new Error(
        "Question collection is not initialized."
      );
    }

    const document = {
      question: question.trim(),

      policy_name: policy_name.trim(),

      provider_id: provider_id || null,

      answer: answer || "",

      model: model || CHAT_MODEL,

      source_count: sources.length,

      sources: sources.map((source) => ({
        policy_name:
          source.policy_name || policy_name,

        source_file:
          source.source_file || "",

        chunk_index:
          source.chunk_index ?? null,

        score:
          typeof source.score === "number"
            ? source.score
            : null,
      })),

      created_at: new Date(),
    };

    const result =
      await questionsCollection.insertOne(
        document
      );

    console.log(
      `💾 Question saved: ${result.insertedId}`
    );

    return result.insertedId;
  } catch (error) {
    console.error(
      "❌ Failed to save question:",
      error
    );

    return null;
  }
}

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",

    database: collection
      ? "connected"
      : "connecting",

    database_name: DB_NAME,

    collection: COLLECTION_NAME,

    vector_index: VECTOR_INDEX_NAME,

    model: CHAT_MODEL,

    embedding_model: EMBEDDING_MODEL,

    timestamp: new Date().toISOString(),
  });
});

// ======================================================
// DEBUG POLICIES
// ======================================================

app.get("/api/debug/policies", async (req, res) => {
  try {
    if (!collection) {
      return res.status(503).json({
        error: "Database is not ready.",
      });
    }

    const policies = await collection
      .aggregate([
        {
          $project: {
            policy_name:
              "$metadata.policy_name",

            root_policy_name:
              "$policy_name",

            source_file:
              "$metadata.source_file",

            provider_name:
              "$metadata.provider_name",

            plan_year:
              "$metadata.plan_year",

            is_active:
              "$metadata.is_active",
          },
        },
        {
          $limit: 5000,
        },
      ])
      .toArray();

    const unique = new Map();

    for (const policy of policies) {
      const name =
        policy.policy_name ||
        policy.root_policy_name ||
        "";

      if (!name || unique.has(name)) {
        continue;
      }

      unique.set(name, {
        policy_name: name,

        source_file:
          policy.source_file || "",

        provider_name:
          policy.provider_name || "",

        plan_year:
          policy.plan_year || "",

        is_active:
          policy.is_active,
      });
    }

    res.json({
      count: unique.size,
      policies: Array.from(unique.values()),
    });
  } catch (error) {
    console.error(
      "❌ Debug policy error:",
      error
    );

    res.status(500).json({
      error: "Unable to inspect policies.",
    });
  }
});

// ======================================================
// GET AVAILABLE POLICIES
// ======================================================

app.get("/api/policies", async (req, res) => {
  try {
    if (!collection) {
      return res.status(503).json({
        error: "Database is not ready yet.",
      });
    }

    const policies = await collection
      .aggregate([
        {
          $project: {
            policy_name:
              "$metadata.policy_name",

            root_policy_name:
              "$policy_name",

            source_file:
              "$metadata.source_file",

            provider_name:
              "$metadata.provider_name",

            plan_year:
              "$metadata.plan_year",

            is_active:
              "$metadata.is_active",
          },
        },
        {
          $limit: 10000,
        },
      ])
      .toArray();

    const unique = new Map();

    for (const policy of policies) {
      const policyName =
        policy.policy_name ||
        policy.root_policy_name ||
        "";

      if (!policyName || unique.has(policyName)) {
        continue;
      }

      unique.set(policyName, {
        id: policyName,

        name: policyName,

        source_file:
          policy.source_file || "",

        provider_name:
          policy.provider_name || "",

        plan_year:
          policy.plan_year || "",
      });
    }

    const result = Array.from(
      unique.values()
    ).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    res.json({
      policies: result,
    });
  } catch (error) {
    console.error(
      "❌ Error loading policies:",
      error
    );

    res.status(500).json({
      error:
        "Unable to load insurance policies.",
    });
  }
});

// ======================================================
// CHAT
// ======================================================

app.post("/api/chat", async (req, res) => {
  try {
    const {
      question,
      policy_name,
      provider_id,
    } = req.body;

    // ==================================================
    // VALIDATE QUESTION
    // ==================================================

    if (
      !question ||
      typeof question !== "string" ||
      !question.trim()
    ) {
      return res.status(400).json({
        error:
          "A valid 'question' string is required.",
      });
    }

    const cleanQuestion = question.trim();

    // ==================================================
    // CASUAL CHAT
    // ==================================================

    if (isCasualMessage(cleanQuestion)) {
      console.log(
        `\n💬 Casual message: ${cleanQuestion}`
      );

      const answerText =
        getCasualResponse(cleanQuestion);

      const questionId =
        await saveQuestion({
          question: cleanQuestion,

          policy_name:
            typeof policy_name === "string"
              ? policy_name.trim()
              : "general",

          answer: answerText,

          model: "casual-response",

          sources: [],

          provider_id,
        });

      return res.json({
        answer: answerText,

        policy_name:
          typeof policy_name === "string"
            ? policy_name.trim()
            : "",

        sources: [],

        model: "casual-response",

        type: "casual",

        question_saved:
          Boolean(questionId),

        question_id:
          questionId
            ? questionId.toString()
            : null,
      });
    }

    // ==================================================
    // VALIDATE POLICY
    // ==================================================

    if (
      !policy_name ||
      typeof policy_name !== "string" ||
      !policy_name.trim()
    ) {
      return res.status(400).json({
        error:
          "A valid 'policy_name' string is required.",
      });
    }

    const cleanPolicyName =
      policy_name.trim();

    console.log(
      "\n============================================================"
    );

    console.log(
      `📩 Question: ${cleanQuestion}`
    );

    console.log(
      `📄 Requested Policy: ${cleanPolicyName}`
    );

    console.log(
      "============================================================"
    );

    // ==================================================
    // STEP 1 — QUERY EMBEDDING
    // ==================================================

    console.log(
      "\n🧮 Generating query embedding..."
    );

    const embeddingModel =
      genAI.getGenerativeModel({
        model: EMBEDDING_MODEL,
      });

    const embeddingResult =
      await embeddingModel.embedContent({
        content: {
          parts: [
            {
              text: cleanQuestion,
            },
          ],
        },
      });

    const queryVector =
      embeddingResult.embedding.values;

    if (
      !queryVector ||
      queryVector.length !== EMBEDDING_DIMENSIONS
    ) {
      throw new Error(
        `Invalid embedding dimensions: ${
          queryVector?.length || 0
        }. Expected ${EMBEDDING_DIMENSIONS}.`
      );
    }

    console.log(
      `✅ Embedding generated: ${queryVector.length} dimensions`
    );

    // ==================================================
    // STEP 2 — SEARCH POLICY
    // ==================================================

    const {
      docs: retrievedDocs,
      policyName: actualPolicyName,
    } = await searchPolicyChunks(
      queryVector,
      cleanPolicyName
    );

    console.log(
      `\n📚 Retrieved ${retrievedDocs.length} chunks`
    );

    console.log(
      `📄 Using policy: ${
        actualPolicyName || cleanPolicyName
      }`
    );

    // ==================================================
    // STEP 3 — NO RESULTS
    // ==================================================

    if (retrievedDocs.length === 0) {
      const answerText =
        "I couldn't find that information in this policy.";

      const questionId =
        await saveQuestion({
          question: cleanQuestion,

          policy_name:
            actualPolicyName ||
            cleanPolicyName,

          answer: answerText,

          model: CHAT_MODEL,

          sources: [],

          provider_id,
        });

      return res.json({
        answer: answerText,

        policy_name:
          actualPolicyName ||
          cleanPolicyName,

        sources: [],

        model: CHAT_MODEL,

        type: "policy",

        question_saved:
          Boolean(questionId),

        question_id:
          questionId
            ? questionId.toString()
            : null,
      });
    }

    // ==================================================
    // STEP 4 — LOG SCORES
    // ==================================================

    console.log("\n📊 Retrieved chunk scores:");

    retrievedDocs.forEach((doc, index) => {
      console.log(
        `   ${index + 1}. score=${
          typeof doc.score === "number"
            ? doc.score.toFixed(4)
            : doc.score
        }`
      );

      console.log(
        `      policy=${getPolicyNameFromDocument(doc)}`
      );
    });

    // ==================================================
    // STEP 5 — RELEVANCE FILTER
    // ==================================================

    let relevantDocs =
      retrievedDocs.filter(
        (doc) =>
          typeof doc.score === "number" &&
          doc.score >= RELEVANCE_THRESHOLD
      );

    // ==================================================
    // FALLBACK RELEVANCE
    // ==================================================

    if (relevantDocs.length === 0) {
      const sorted = [...retrievedDocs]
        .filter(
          (doc) =>
            typeof doc.score === "number"
        )
        .sort(
          (a, b) =>
            b.score - a.score
        );

      if (
        sorted.length > 0 &&
        sorted[0].score >= 0.25
      ) {
        console.log(
          "⚠️ No chunks passed normal threshold."
        );

        console.log(
          "ℹ️ Using best available chunks as fallback."
        );

        relevantDocs = sorted.slice(
          0,
          Math.min(5, sorted.length)
        );
      }
    }

    // ==================================================
    // NO SUFFICIENTLY RELEVANT RESULTS
    // ==================================================

    if (relevantDocs.length === 0) {
      const answerText =
        "I couldn't find that information in this policy.";

      const questionId =
        await saveQuestion({
          question: cleanQuestion,

          policy_name:
            actualPolicyName ||
            cleanPolicyName,

          answer: answerText,

          model: CHAT_MODEL,

          sources: [],

          provider_id,
        });

      return res.json({
        answer: answerText,

        policy_name:
          actualPolicyName ||
          cleanPolicyName,

        sources: [],

        model: CHAT_MODEL,

        type: "policy",

        question_saved:
          Boolean(questionId),

        question_id:
          questionId
            ? questionId.toString()
            : null,
      });
    }

    console.log(
      `📚 Using ${relevantDocs.length} relevant chunks`
    );

    // ==================================================
    // STEP 6 — BUILD CONTEXT
    // ==================================================

    const contextText = relevantDocs
      .map(
        (doc, index) =>
          `[Policy Information ${index + 1}]

Policy:
${
  getPolicyNameFromDocument(doc) ||
  actualPolicyName ||
  cleanPolicyName
}

Document:
${
  doc.metadata?.source_file ||
  "Policy document"
}

Content:
${doc.text}`
      )
      .join(
        "\n\n------------------------------\n\n"
      );

    // ==================================================
    // STEP 7 — BUILD PROMPT
    // ==================================================

    const prompt = `
You are CoverageAI, an insurance policy assistant.

Answer the user's question using ONLY the policy information provided below.

Use simple, clear English.

IMPORTANT RULES:

1. Every factual statement must be supported by the provided policy information.

2. Do not use outside knowledge.

3. Do not guess.

4. Do not invent deductibles, copays, coinsurance, prices, limits, exclusions, referrals, benefits, or coverage.

5. If the provided policy information does not answer the question, say:
"I couldn't find that information in this policy."

6. If the policy gives different benefits or costs for different situations, explain those differences clearly.

7. Keep dollar amounts, percentages, limits, frequencies, and conditions accurate.

8. If an insurance term is necessary, explain it briefly in simple language.

9. If the question is ambiguous, explain what the policy information says and what information is missing.

10. Do not mention:
- AI
- embeddings
- vector search
- chunks
- databases
- prompts
- retrieval
- internal system details

11. Do not claim coverage simply because something sounds medically reasonable.

12. If the policy says a service is covered only under certain conditions, include those conditions.

13. Answer directly.

14. Do not start with "Hello! I am CoverageAI."

POLICY:
${actualPolicyName || cleanPolicyName}

POLICY INFORMATION:
${contextText}

USER QUESTION:
${cleanQuestion}

ANSWER:
`;

    // ==================================================
    // STEP 8 — GENERATE ANSWER
    // ==================================================

    const {
      result: chatResult,
      modelName,
    } = await generateAnswer(prompt);

    const answerText =
      chatResult.response
        .text()
        .trim();

    // ==================================================
    // STEP 9 — SOURCES
    // ==================================================

    const sources =
      relevantDocs.map(
        (doc) => ({
          text: doc.text,

          score: doc.score,

          policy_name:
            getPolicyNameFromDocument(doc),

          source_file:
            doc.metadata?.source_file ||
            "",

          chunk_index:
            doc.metadata?.chunk_index ??
            null,
        })
      );

    // ==================================================
    // STEP 10 — SAVE QUESTION
    // ==================================================

    const questionId =
      await saveQuestion({
        question: cleanQuestion,

        policy_name:
          actualPolicyName ||
          cleanPolicyName,

        answer: answerText,

        model: modelName,

        sources,

        provider_id,
      });

    // ==================================================
    // STEP 11 — SEND RESPONSE
    // ==================================================

    console.log(
      "\n✅ Request completed successfully"
    );

    console.log(
      `🤖 Model used: ${modelName}`
    );

    console.log(
      "📤 Sending response to frontend"
    );

    return res.json({
      answer: answerText,

      policy_name:
        actualPolicyName ||
        cleanPolicyName,

      sources,

      model: modelName,

      type: "policy",

      question_saved:
        Boolean(questionId),

      question_id:
        questionId
          ? questionId.toString()
          : null,
    });
  } catch (error) {
    console.error(
      "\n❌ ERROR PROCESSING REQUEST"
    );

    console.error(error);

    const status =
      error?.status ||
      error?.response?.status;

    if (status === 503) {
      return res.status(503).json({
        error:
          "The AI service is temporarily busy. Please try again in a moment.",
      });
    }

    if (status === 429) {
      return res.status(429).json({
        error:
          "The AI service is temporarily rate-limited. Please try again shortly.",
      });
    }

    if (status === 401) {
      return res.status(401).json({
        error:
          "The Gemini API key is invalid or unauthorized.",
      });
    }

    if (
      error?.message?.includes(
        "$vectorSearch"
      )
    ) {
      return res.status(500).json({
        error:
          "MongoDB vector search failed. Please check the vector index name, embedding field, and embedding dimensions.",
      });
    }

    return res.status(500).json({
      error:
        "I couldn't process your question right now. Please try again.",
    });
  }
});

// ======================================================
// SUBMIT FEEDBACK
// ======================================================

app.post("/api/feedback", async (req, res) => {
  try {
    if (!feedbackCollection) {
      return res.status(503).json({
        success: false,
        error:
          "Feedback service is not ready yet.",
      });
    }

    const {
      name,
      email,
      feedback,
      policy_name,
    } = req.body;

    // --------------------------------------------------
    // VALIDATION
    // --------------------------------------------------

    if (
      !name ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Please enter your name.",
      });
    }

    if (
      !email ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Please enter your email.",
      });
    }

    if (
      !feedback ||
      typeof feedback !== "string" ||
      !feedback.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Please enter your feedback.",
      });
    }

    // --------------------------------------------------
    // EMAIL VALIDATION
    // --------------------------------------------------

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error:
          "Please enter a valid email address.",
      });
    }

    // --------------------------------------------------
    // LIMIT INPUT SIZE
    // --------------------------------------------------

    const cleanName = name
      .trim()
      .slice(0, 100);

    const cleanEmail = email
      .trim()
      .toLowerCase()
      .slice(0, 200);

    const cleanFeedback = feedback
      .trim()
      .slice(0, 5000);

    const cleanPolicyName =
      typeof policy_name === "string"
        ? policy_name.trim().slice(0, 300)
        : "";

    // --------------------------------------------------
    // SAVE FEEDBACK
    // --------------------------------------------------

    const feedbackDocument = {
      name: cleanName,

      email: cleanEmail,

      feedback: cleanFeedback,

      policy_name: cleanPolicyName,

      created_at: new Date(),

      source: "coverageai-web",

      status: "new",
    };

    const result =
      await feedbackCollection.insertOne(
        feedbackDocument
      );

    console.log(
      "\n💙 NEW FEEDBACK RECEIVED"
    );

    console.log(`👤 Name: ${cleanName}`);
    console.log(`📧 Email: ${cleanEmail}`);

    console.log(
      `📄 Policy: ${
        cleanPolicyName || "Not specified"
      }`
    );

    console.log(
      `🆔 Feedback ID: ${result.insertedId}`
    );

    return res.status(201).json({
      success: true,

      message:
        "Thank you! Your feedback has been submitted successfully.",

      feedback_id:
        result.insertedId.toString(),
    });
  } catch (error) {
    console.error(
      "\n❌ FEEDBACK SUBMISSION ERROR"
    );

    console.error(error);

    return res.status(500).json({
      success: false,

      error:
        "We couldn't submit your feedback right now. Please try again.",
    });
  }
});

// ======================================================
// GET STORED QUESTIONS
// ======================================================

app.get("/api/questions", async (req, res) => {
  try {
    if (!questionsCollection) {
      return res.status(503).json({
        error:
          "Question database is not ready yet.",
      });
    }

    const requestedLimit =
      Number(req.query.limit) || 50;

    const limit = Math.min(
      Math.max(requestedLimit, 1),
      200
    );

    const questions =
      await questionsCollection
        .find({})
        .sort({
          created_at: -1,
        })
        .limit(limit)
        .toArray();

    return res.json({
      questions,
    });
  } catch (error) {
    console.error(
      "❌ Error loading questions:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to load stored questions.",
    });
  }
});

// ======================================================
// QUESTION STATISTICS
// ======================================================

app.get(
  "/api/questions/stats",
  async (req, res) => {
    try {
      if (!questionsCollection) {
        return res.status(503).json({
          error:
            "Question database is not ready yet.",
        });
      }

      const total =
        await questionsCollection.countDocuments();

      const policies =
        await questionsCollection
          .aggregate([
            {
              $group: {
                _id: "$policy_name",

                count: {
                  $sum: 1,
                },
              },
            },

            {
              $sort: {
                count: -1,
              },
            },
          ])
          .toArray();

      return res.json({
        total_questions: total,

        questions_by_policy:
          policies.map((item) => ({
            policy_name: item._id,
            count: item.count,
          })),
      });
    } catch (error) {
      console.error(
        "❌ Error loading question statistics:",
        error
      );

      return res.status(500).json({
        error:
          "Unable to load question statistics.",
      });
    }
  }
);

// ======================================================
// START SERVER
// ======================================================

async function startServer() {
  await initDb();

  app.listen(PORT, "0.0.0.0", () => {
    console.log("");

    console.log(
      "=========================================="
    );

    console.log(
      `🚀 CoverageAI backend running on port ${PORT}`
    );

    console.log(
      `💻 Local: http://localhost:${PORT}`
    );

    console.log(
      `💬 Chat: http://localhost:${PORT}/api/chat`
    );

    console.log(
      `📋 Policies: http://localhost:${PORT}/api/policies`
    );

    console.log(
      `📝 Feedback: http://localhost:${PORT}/api/feedback`
    );

    console.log(
      `❤️ Health: http://localhost:${PORT}/api/health`
    );

    console.log(
      "=========================================="
    );

    console.log(
      `🤖 Chat model: ${CHAT_MODEL}`
    );

    console.log(
      `🧠 Embedding model: ${EMBEDDING_MODEL}`
    );

    console.log("");
  });
}

// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

async function shutdown() {
  console.log(
    "\n🛑 Shutting down server..."
  );

  try {
    await mongoClient.close();

    console.log(
      "🔒 MongoDB connection closed."
    );
  } catch (error) {
    console.error(
      "❌ Error closing MongoDB:",
      error
    );
  }

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ======================================================
// START APPLICATION
// ======================================================

startServer().catch((error) => {
  console.error(
    "❌ Failed to start server:"
  );

  console.error(error);

  process.exit(1);
});
