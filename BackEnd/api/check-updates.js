// ...existing code...
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

import mongoose from "mongoose";
import axios from "axios";
import nodemailer from "nodemailer";
import { GoogleGenAI } from "@google/genai";
import { JSDOM } from "jsdom";
import crypto from "crypto";

// --- CONFIGURATION ---
const {
  MONGODB_URI,
  GMAIL_EMAIL,
  GMAIL_APP_PASSWORD,
  ENCRYPTION_SECRET_KEY,
  CRON_SECRET,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  GEMINI_API_KEY,
} = process.env;

// --- DATABASE & MODELS ---
const linkSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    collectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Collection",
      default: null,
    },
    title: { type: String, required: true },
    urlLink: { type: String },
    tags: { type: [String], default: ["Tag"] },
    notes: { type: String, trim: true },
    encryptedUrl: { type: String },
    iv: { type: String },
    status: {
      type: String,
      enum: ["pending", "up-to-date", "updated", "error"],
      default: "pending",
    },
    lastChecked: { type: Date },
    updateSummary: { type: String, default: "" },
    lastContentText: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Decryption logic
const algorithm = "aes-256-cbc";
let secretKey = ENCRYPTION_SECRET_KEY || "";
if (secretKey.length < 32) secretKey = secretKey.padEnd(32, "0");
else if (secretKey.length > 32) secretKey = secretKey.slice(0, 32);
secretKey = Buffer.from(secretKey, "utf8");

linkSchema.virtual("decryptedUrl").get(function () {
  if (!this.encryptedUrl || !this.iv || !secretKey) return null;
  try {
    const decipher = crypto.createDecipheriv(
      algorithm,
      secretKey,
      Buffer.from(this.iv, "hex")
    );
    let decrypted = decipher.update(this.encryptedUrl, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    return null;
  }
});

const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
});

// --- HELPER FUNCTIONS ---

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined in environment variables");
}

const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

let transporter = null;

const createTransporter = () => {
  if (!transporter) {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      throw new Error("SMTP credentials are missing in environment variables");
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10) || 587,
      secure: parseInt(SMTP_PORT, 10) === 465, // true for 465, false for others
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return transporter;
};

async function fetchPageText(url) {
  if (!url) return null;
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 15000,
      maxRedirects: 5,
    });
    const dom = new JSDOM(data);
    return dom.window.document.body.textContent.replace(/\s\s+/g, " ").trim();
  } catch (error) {
    console.error(`[Monitor] Error fetching URL ${url}:`, error.message);
    return null;
  }
}

async function checkForUpdates(newContent, oldContent) {
  if (!newContent || !oldContent) return { hasUpdate: false, changes: null };
  const prompt = `You are an intelligent website update detection assistant. Compare the OLD CONTENT with the NEW CONTENT of a webpage. Your goal is to identify if a **significant update** has occurred, like a new software version, a major feature announcement, or a documentation rewrite. **Ignore** minor changes like typo fixes, date updates, or small blog posts. Respond with a JSON object. - If a major update is found, respond with: {"update": true, "changes": "A summary of what changed."} - If no major update is found, respond with: {"update": false, "changes": null} --- OLD CONTENT: ${oldContent.substring(0, 4000)} --- NEW CONTENT: ${newContent.substring(0, 4000)} --- JSON Response:`;
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let jsonText = result.text?.trim() || "";
    // Remove markdown code blocks if present
    if (jsonText.includes("```")) {
      jsonText = jsonText
        .replace(/```json\n?/g, "")
        .replace(/```/g, "")
        .trim();
    }
    // Remove leading/trailing non-JSON text
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(jsonText);
    return {
      hasUpdate: !!parsed.update,
      changes: parsed.changes || null,
    };
  } catch (error) {
    console.error("[Monitor] Error checking for updates with Gemini:", error);
    return { hasUpdate: false, changes: null };
  }
}

const sendUpdateEmail = async (userEmail, linkUrl, linkTitle, changes) => {
  try {
    const smtpTransporter = createTransporter();
    const mailOptions = {
      from: {
        name: "SnapLink Updates",
        address: GMAIL_EMAIL,
      },
      to: userEmail,
      subject: `SnapLink Update: '${linkTitle}' has changed!`,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;"><h2>Hey there!</h2><p>We noticed a significant update to one of your saved links:</p><p><strong><a href="${linkUrl}" target="_blank">${linkTitle}</a></strong></p><hr><h3>Here's what changed:</h3><p style="background-color: #f4f4f4; padding: 15px; border-radius: 5px;"><em>${changes}</em></p><p>Happy linking!</p><p><em>The SnapLink Team</em></p></div>`,
    };
    const result = await smtpTransporter.sendMail(mailOptions);
    console.log("✅ Update email sent successfully:", result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("❌ Error sending update email:", error);
    return { success: false, error: error.message };
  }
};

async function processSingleLink(link, LinkModel) {
  const urlToCheck = link.decryptedUrl;
  if (!urlToCheck) {
    console.log(`[Skipping] Link ${link._id} has no URL.`);
    return;
  }

  console.log(`[Checking] Link: ${link.title}`);
  const newContent = await fetchPageText(urlToCheck);

  const updateData = { lastChecked: new Date() };

  if (!newContent) {
    updateData.status = "error";
    console.log(`[Error] Could not fetch content for ${link.title}.`);
  } else if (!link.lastContentText) {
    updateData.status = "up-to-date";
    updateData.lastContentText = newContent;
    console.log(`[Baseline] Stored initial content for ${link.title}.`);
  } else {
    const result = await checkForUpdates(newContent, link.lastContentText);
    if (result.hasUpdate) {
      console.log(`[Update Found] For ${link.title}!`);
      const linkWithOwner = await LinkModel.findById(link._id).populate(
        "userId",
        "email"
      );
      if (linkWithOwner && linkWithOwner.userId) {
        await sendUpdateEmail(
          linkWithOwner.userId.email,
          urlToCheck,
          link.title,
          result.changes
        );
      }
      updateData.status = "updated";
      updateData.updateSummary = result.changes;
      updateData.lastContentText = newContent;
      updateData.$push = {
        updateHistory: {
          timestamp: new Date(),
          changes: result.changes
        }
      };
    } else {
      updateData.status = "up-to-date";
      console.log(`[No Update] For ${link.title}.`);
    }
  }
  
  // Use $set for standard fields, and $push for arrays if it exists in updateData
  const updateOp = { $set: {} };
  for (const key in updateData) {
      if (key === "$push") {
          updateOp.$push = updateData.$push;
      } else {
          updateOp.$set[key] = updateData[key];
      }
  }

  await LinkModel.findByIdAndUpdate(link._id, updateOp);
}

// --- VERCEL SERVERLESS HANDLER ---
export default async function handler(request, response) {
  if (
    !request.headers.authorization ||
    request.headers.authorization !== `Bearer ${CRON_SECRET}`
  ) {
    return response.status(401).json({ message: "Unauthorized" });
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected for cron job.");

    const Link = mongoose.models.Link || mongoose.model("Link", linkSchema);
    const User = mongoose.models.User || mongoose.model("User", userSchema);

    const linksToCheck = await Link.find().select("+lastContentText");
    console.log(`Found ${linksToCheck.length} links to process in parallel.`);

    if (linksToCheck.length > 0) {
      const allPromises = linksToCheck.map((link) =>
        processSingleLink(link, Link)
      );
      await Promise.allSettled(allPromises);
    }

    await mongoose.connection.close();
    console.log("Cron job finished successfully.");

    return response
      .status(200)
      .json({ message: `Processed ${linksToCheck.length} links.` });
  } catch (error) {
    console.error("Error in Vercel Cron Job:", error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    return response.status(500).json({ message: "An error occurred." });
  }
}
// ...existing code...
