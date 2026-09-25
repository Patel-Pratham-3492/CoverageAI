import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const require = createRequire(import.meta.url);
const pdfModule = require("pdf-parse");

// ======================================================
// CONFIGURATION
// ======================================================

const DB_NAME = "insurance_rag";
const COLLECTION_NAME = "policy_chunks";

const DOCS_DIR = path.join(process.cwd(), "docs");

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 3072;

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

// ======================================================
// PDF PARSER
// ======================================================

async function parsePdfData(dataBuffer) {
  if (typeof pdfModule === "function") {
    const pdfData = await pdfModule(dataBuffer);

    return {
      text: pdfData.text,
      numpages: pdfData.numpages,
    };
  }

  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({
      data: dataBuffer,
    });

    try {
      const result = await parser.getText();

      return {
        text: result.text,
        numpages: result.total,
      };
    } finally {
      await parser.destroy();
    }
  }

  throw new Error("Unsupported pdf-parse module format.");
}

// ======================================================
// POLICY NAME
// ======================================================

function getPolicyName(fileName) {
  return path.basename(fileName, path.extname(fileName)).trim();
}

// ======================================================
// FIND PDF FILES
// ======================================================

function getPdfFiles() {
  if (!fs.existsSync(DOCS_DIR)) {
    throw new Error(`Docs folder does not exist: ${DOCS_DIR}`);
  }

  return fs
    .readdirSync(DOCS_DIR)
    .filter((file) => file.toLowerCase().endsWith(".pdf"));
}

// ======================================================
// ENVIRONMENT VALIDATION
// ======================================================

function validateEnvironment() {
  const { MONGODB_URI, GEMINI_API_KEY } = process.env;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined.");
  }

  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined.");
  }

  return {
    MONGODB_URI,
    GEMINI_API_KEY,
  };
}

// ======================================================
// MAIN INGESTION
// ======================================================

async function runIngestion() {
  console.log("\n==========================================");
  console.log("🚀 CoverageAI Policy Ingestion");
  console.log("==========================================");

  // ----------------------------------------------------
  // Validate environment
  // ----------------------------------------------------

  const { MONGODB_URI, GEMINI_API_KEY } =
    validateEnvironment();

  // ----------------------------------------------------
  // Find PDFs
  // ----------------------------------------------------

  const pdfFiles = getPdfFiles();

  if (pdfFiles.length === 0) {
    throw new Error(`No PDF files found in ${DOCS_DIR}`);
  }

  console.log(`📚 Found ${pdfFiles.length} policy PDF(s):`);

  for (const file of pdfFiles) {
    console.log(`   📄 ${file}`);
  }

  // ----------------------------------------------------
  // Initialize Gemini
  // ----------------------------------------------------

  console.log("\n🧠 Initializing Gemini embedding model...");

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const embeddingModel = genAI.getGenerativeModel({
    model: EMBEDDING_MODEL,
  });

  // ----------------------------------------------------
  // Connect MongoDB
  // ----------------------------------------------------

  console.log("\n🔗 Connecting to MongoDB Atlas...");

  const client = new MongoClient(MONGODB_URI);

  await client.connect();

  const collection = client
    .db(DB_NAME)
    .collection(COLLECTION_NAME);

  console.log("✅ Connected to MongoDB Atlas");

  let totalInserted = 0;

  try {
    // ==================================================
    // PROCESS EACH POLICY
    // ==================================================

    for (let fileIndex = 0; fileIndex < pdfFiles.length; fileIndex++) {
      const fileName = pdfFiles[fileIndex];
      const filePath = path.join(DOCS_DIR, fileName);
      const policyName = getPolicyName(fileName);

      console.log("\n");
      console.log("==========================================");
      console.log(`📋 Policy ${fileIndex + 1}/${pdfFiles.length}`);
      console.log(`📄 File: ${fileName}`);
      console.log(`🏷️ Policy Name: ${policyName}`);
      console.log("==========================================");

      // ------------------------------------------------
      // Read PDF
      // ------------------------------------------------

      console.log("\n📖 Reading PDF...");

      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await parsePdfData(dataBuffer);

      if (!pdfData.text || !pdfData.text.trim()) {
        console.warn(
          `⚠️ No extractable text found in ${fileName}. Skipping.`
        );

        continue;
      }

      console.log("✅ PDF loaded");
      console.log(`📄 Pages: ${pdfData.numpages}`);
      console.log(`📝 Characters: ${pdfData.text.length}`);

      // ------------------------------------------------
      // Split text
      // ------------------------------------------------

      console.log("\n✂️ Splitting document...");

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      });

      const rawChunks = await splitter.splitText(pdfData.text);

      console.log(`✅ Generated ${rawChunks.length} chunks`);

      // ------------------------------------------------
      // Remove existing chunks for this policy
      // ------------------------------------------------

      console.log(
        `\n🧹 Checking existing chunks for "${policyName}"...`
      );

      const deleteResult = await collection.deleteMany({
        "metadata.policy_name": policyName,
      });

      if (deleteResult.deletedCount > 0) {
        console.log(
          `🗑️ Removed ${deleteResult.deletedCount} old chunks`
        );
      } else {
        console.log("ℹ️ No existing chunks found");
      }

      // ------------------------------------------------
      // Generate embeddings
      // ------------------------------------------------

      console.log("\n🧠 Generating embeddings...");

      const documentsToInsert = [];

      for (let i = 0; i < rawChunks.length; i++) {
        const chunkText = rawChunks[i].trim();

        if (!chunkText) {
          continue;
        }

        try {
          const result = await embeddingModel.embedContent({
            content: {
              parts: [
                {
                  text: chunkText,
                },
              ],
            },
          });

          const vector = result.embedding.values;

          // --------------------------------------------
          // Validate vector
          // --------------------------------------------

          if (
            !vector ||
            vector.length !== EMBEDDING_DIMENSIONS
          ) {
            throw new Error(
              `Expected ${EMBEDDING_DIMENSIONS} dimensions but received ${
                vector?.length || 0
              }`
            );
          }

          // --------------------------------------------
          // Prepare MongoDB document
          // --------------------------------------------

          documentsToInsert.push({
            text: chunkText,
            embedding: vector,
            metadata: {
              policy_name: policyName,
              source_file: fileName,
              chunk_index: i,
              is_active: true,
            },
          });

          if (
            (i + 1) % 10 === 0 ||
            i === rawChunks.length - 1
          ) {
            console.log(
              `   🧠 ${i + 1}/${rawChunks.length} chunks embedded`
            );
          }

          // Small delay to avoid sending requests
          // too aggressively.
          await new Promise((resolve) =>
            setTimeout(resolve, 100)
          );
        } catch (error) {
          console.error(
            `❌ Failed on chunk ${i}:`,
            error?.message || error
          );

          throw error;
        }
      }

      // ------------------------------------------------
      // Insert chunks
      // ------------------------------------------------

      console.log("\n💾 Uploading chunks to MongoDB...");

      if (documentsToInsert.length === 0) {
        console.warn(
          "⚠️ No chunks generated. Skipping insertion."
        );

        continue;
      }

      const uploadResult = await collection.insertMany(
        documentsToInsert
      );

      totalInserted += uploadResult.insertedCount;

      console.log(
        `✅ Inserted ${uploadResult.insertedCount} chunks`
      );

      console.log(`🏷️ Policy: ${policyName}`);
    }

    // ==================================================
    // COMPLETE
    // ==================================================

    console.log("\n");
    console.log("==========================================");
    console.log("🎉 INGESTION COMPLETE");
    console.log("==========================================");
    console.log(`📚 Policies processed: ${pdfFiles.length}`);
    console.log(`📦 Total chunks inserted: ${totalInserted}`);
    console.log(`📐 Embedding dimensions: ${EMBEDDING_DIMENSIONS}`);
    console.log(`🗄️ Database: ${DB_NAME}`);
    console.log(`📁 Collection: ${COLLECTION_NAME}`);
    console.log("==========================================\n");
  } finally {
    await client.close();
    console.log("🔒 MongoDB connection closed.");
  }
}

// ======================================================
// START
// ======================================================

runIngestion().catch((error) => {
  console.error("\n❌ INGESTION FAILED");
  console.error(error?.message || error);

  process.exitCode = 1;
});
