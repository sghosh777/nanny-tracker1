
import { GoogleGenAI, Type } from "@google/genai";
import { TimeSession } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getSessionSummary = async (sessions: TimeSession[]) => {
  const prompt = `Review the following time sessions for a nanny and provide a concise summary. 
  Include: Total hours worked, a brief breakdown of the schedule, and any anomalies (like very short or very long shifts).
  Sessions: ${JSON.stringify(sessions)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are an assistant for a parent managing a nanny's payroll. Be professional, clear, and focused on hours and pay calculations.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini summary error:", error);
    return "Could not generate summary at this time.";
  }
};
