import { GoogleGenAI, Type } from "@google/genai";
import { CloudType } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

interface GeneratedIdea {
  title: string;
  description: string;
  emoji: string;
  type: CloudType;
  cost?: number;
}

interface DeepResponse {
    systemName: string;
    theme: 'warm' | 'cool' | 'dark' | 'nature';
    ideas: GeneratedIdea[];
}

export const generateIdeas = async (topic: string, isDeepThink: boolean = false): Promise<DeepResponse | GeneratedIdea[]> => {
  if (!apiKey) {
    console.warn("No API Key available for Gemini.");
    return [];
  }

  try {
    if (isDeepThink) {
        // --- GEMINI 3 PRO PREVIEW WITH THINKING ---
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: `Analyze the topic "${topic}" deeply. Create a comprehensive "Weather System" (a category or zone) for this topic.
            Then, brainstorm 5-8 distinct, actionable sub-items (clouds) that belong in this system.
            
            Structure the response to include:
            1. A system name (creative title for the zone).
            2. A visual theme ('warm', 'cool', 'dark', 'nature').
            3. A list of cloud ideas, where each has a type (cumulus/thought/nimbus/cirrus/storm/stratus/lenticular), title, description, emoji, and optional cost.`,
            config: {
                thinkingConfig: { thinkingBudget: 32768 },
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        systemName: { type: Type.STRING },
                        theme: { type: Type.STRING, enum: ['warm', 'cool', 'dark', 'nature'] },
                        ideas: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    emoji: { type: Type.STRING },
                                    cost: { type: Type.NUMBER, nullable: true },
                                    type: { type: Type.STRING, enum: ['cumulus', 'thought', 'nimbus', 'cirrus', 'storm', 'stratus', 'lenticular'] }
                                },
                                required: ['title', 'description', 'emoji', 'type']
                            }
                        }
                    },
                    required: ['systemName', 'theme', 'ideas']
                }
            }
        });
        
        const text = response.text;
        if (!text) return [];
        return JSON.parse(text) as DeepResponse;

    } else {
        // --- GEMINI 3 FLASH (Fast) ---
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Brainstorm 3-5 creative and distinct tasks or ideas related to: "${topic}". 
            Assign a 'type' based on the nature of the task:
            - 'cumulus' for standard tasks.
            - 'thought' for ideas needing consideration.
            - 'nimbus' for heavy/expensive projects.
            - 'cirrus' for quick/light tasks.
            - 'storm' for problems or cancellations.
            - 'stratus' for background/foundation tasks.
            - 'lenticular' for weird/unique ideas.
            
            Assign a rough estimated cost (number) ONLY if relevant (e.g. for expenses). Otherwise leave cost null.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        emoji: { type: Type.STRING },
                        cost: { type: Type.NUMBER, nullable: true },
                        type: { type: Type.STRING, enum: ['cumulus', 'thought', 'nimbus', 'cirrus', 'storm', 'stratus', 'lenticular'] }
                    },
                    required: ['title', 'description', 'emoji', 'type']
                }
                }
            }
        });

        const text = response.text;
        if (!text) return [];
        return JSON.parse(text) as GeneratedIdea[];
    }
  } catch (error) {
    console.error("Gemini Brainstorm Error:", error);
    return [];
  }
};

export const expandIdea = async (parentIdea: string, parentDesc: string): Promise<GeneratedIdea[]> => {
    if (!apiKey) return [];
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `The user has an idea: "${parentIdea}" (${parentDesc}). 
            Generate 3-4 concrete next steps, sub-tasks, or related questions that branch off from this idea.
            Keep them short and punchy.
             Assign a 'type' based on the nature of the task:
            - 'cumulus' for standard tasks.
            - 'thought' for ideas needing consideration.
            - 'nimbus' for heavy/expensive projects.
            - 'cirrus' for quick/light tasks.
            - 'storm' for problems or cancellations.`,
             config: {
                responseMimeType: "application/json",
                responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        emoji: { type: Type.STRING },
                        cost: { type: Type.NUMBER, nullable: true },
                        type: { type: Type.STRING, enum: ['cumulus', 'thought', 'nimbus', 'cirrus', 'storm', 'stratus', 'lenticular'] }
                    },
                    required: ['title', 'description', 'emoji', 'type']
                }
                }
            }
        });
        const text = response.text;
        if (!text) return [];
        return JSON.parse(text) as GeneratedIdea[];
    } catch (e) {
        console.error("Expand Error", e);
        return [];
    }
}
