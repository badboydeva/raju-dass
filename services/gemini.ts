
import { GoogleGenAI } from "@google/genai";
import { ProductionEntry } from "../types";

export const analyzeProductionData = async (data: ProductionEntry[]) => {
  if (data.length === 0) return "Add some data to get AI insights.";

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    As an industrial production analyst, analyze this inventory and production data for "Running Drums":
    ${JSON.stringify(data.slice(-10))}
    
    Provide a concise summary of:
    1. Production trends.
    2. Stock consumption efficiency.
    3. Any anomalies in rate or amounts.
    Keep the tone professional and actionable.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text || "No insights generated.";
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Failed to analyze data with AI.";
  }
};
