import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const { MONGODB_URI } = process.env;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined.");
}

const client = new MongoClient(MONGODB_URI);

async function cleanCollection() {
  try {
    await client.connect();

    const collection = client
      .db("insurance_rag")
      .collection("policy_chunks");

    const result = await collection.deleteMany({});

    console.log(`Deleted ${result.deletedCount} documents.`);
  } finally {
    await client.close();
  }
}

cleanCollection().catch((error) => {
  console.error("Failed to clean collection:", error);
  process.exitCode = 1;
});
