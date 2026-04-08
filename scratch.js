import dotenv from "dotenv";
dotenv.config({ path: "./BackEnd/.env" });
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Testing",
    });
    console.log(response.text);
  } catch (err) {
    console.error("ERROR:", err);
  }
}
run();
