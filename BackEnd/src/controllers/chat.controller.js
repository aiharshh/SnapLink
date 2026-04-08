import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Link } from "../models/link.models.js";
import { GoogleGenAI } from "@google/genai";

const handleChat = asyncHandler(async (req, res) => {
  const { message, conversationHistory = [] } = req.body;
  const userId = req.user._id;

  if (!message) {
    throw new ApiError(400, "Message is required.");
  }

  // Fetch all user links without the large lastContentText
  const links = await Link.find({ userId });

  if (links.length === 0) {
    return res.status(200).json({
      reply: "You haven't saved any links yet. Start saving links to ask questions about your tracking history!"
    });
  }

  // Build massive timeline context string
  let contextStr = "Here is the timeline of updates and information for my saved links:\n\n";

  links.forEach(link => {
    const obj = link.toObject({ virtuals: true });
    contextStr += `### Link: ${obj.title}\n`;
    contextStr += `- URL: ${obj.decryptedUrl || "N/A"}\n`;
    contextStr += `- Tags: ${obj.tags.join(", ")}\n`;
    contextStr += `- Notes: ${obj.notes || "None"}\n`;

    // Add update timeline history
    if (obj.updateHistory && obj.updateHistory.length > 0) {
      contextStr += `- Update History Timeline:\n`;
      // Ensure history is ordered chronologically
      const sortedHistory = obj.updateHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      sortedHistory.forEach(history => {
        const dateStr = new Date(history.timestamp).toDateString();
        contextStr += `   * [${dateStr}]: ${history.changes}\n`;
      });
    } else {
      contextStr += `- Update History: No updates recorded yet. (Current summary: ${obj.updateSummary || "None."})\n`;
    }
    contextStr += `\n`;
  });

  const systemInstruction = `You are a Conversational "Time-Travel" Chatbot embedded in a web monitoring app called SnapLink. 
Your goal is to answer queries by synthesizing intelligence over massive timelines from the user's saved links.
Pay close attention to dates and the sequence of changes described in the "Update History Timeline" for each link to answer complex questions (e.g., "what happened between X and Y", "summarize changes over the last year").
Your response should be in Markdown format, be extremely helpful, professional, and directly address the user's question using their saved context. Do not make up information that is not in the context.

=== USER'S DATA CONTEXT ===
${contextStr}
===========================`;

  try {
    let fullPrompt = "";
    if (conversationHistory.length > 0) {
      fullPrompt += "Previous context in this session:\n";
      conversationHistory.forEach(msg => {
        fullPrompt += `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content}\n`;
      });
      fullPrompt += `\nNow reply to this new message: ${message}`;
    } else {
      fullPrompt = message;
    }

    // Force injection of API key into every request
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return res.status(200).json({
      reply: response.text,
    });
  } catch (error) {
    console.error("Gemini API Error in Chatbot:", error);
    
    // Check if the error is a 503 High Demand or 429 Rate Limit from Google
    const errorMsg = error.message || "";
    if (errorMsg.includes("503") || errorMsg.includes("high demand") || errorMsg.includes("429")) {
      return res.status(200).json({
        reply: `*(I'm currently experiencing very high demand on the AI servers. Please wait a moment and try asking again!)*`
      });
    }

    return res.status(200).json({
      reply: `*(I encountered a temporary connection error. Please try again.)*`
    });
  }
});

export { handleChat };
