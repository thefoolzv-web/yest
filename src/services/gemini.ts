import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";
import { Message, RoadmapStep, QuizQuestion, Flashcard } from "../types";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const createAgentFunctionDeclaration: FunctionDeclaration = {
  name: "create_agent",
  parameters: {
    type: Type.OBJECT,
    description: "Lahirkan agen AI baru berdasarkan topik dan karakter yang diinginkan pengguna.",
    properties: {
      name: { type: Type.STRING, description: "Nama agen baru (misal: Kak Budi, Prof. Einstein)" },
      topic: { type: Type.STRING, description: "Topik spesifik yang akan diajarkan agen ini" },
      emotion: { type: Type.STRING, description: "Emosi dominan agen (Ceria, Tenang, Tegas, Sabar)" },
      teachingStyle: { type: Type.STRING, description: "Gaya mengajar (Sokratik, Visual, Praktis, Storytelling)" },
      character: { type: Type.STRING, description: "Karakter agen (Profesor, Kakak Kelas, Robot, Sahabat)" }
    },
    required: ["name", "topic", "emotion", "teachingStyle", "character"]
  }
};

export async function getChatResponse(
  modelName: string,
  systemInstruction: string,
  history: Message[],
  message: string,
  tools?: any[]
) {
  const model = genAI.models.generateContent({
    model: modelName,
    contents: [
      ...history.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ],
    config: {
      systemInstruction,
      tools: tools ? [{ functionDeclarations: tools }] : undefined
    }
  });

  const response = await model;
  return response;
}

export async function* getChatResponseStream(
  modelName: string,
  systemInstruction: string,
  history: Message[],
  message: string,
  tools?: any[]
) {
  const responseStream = await genAI.models.generateContentStream({
    model: modelName,
    contents: [
      ...history.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ],
    config: {
      systemInstruction,
      tools: tools ? [{ functionDeclarations: tools }] : undefined
    }
  });

  for await (const chunk of responseStream) {
    yield chunk;
  }
}

export async function generateRoadmap(topic: string): Promise<RoadmapStep[]> {
  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a daily learning roadmap for the topic: "${topic}". 
    The output must be a JSON array of steps, where each step has:
    - id: string (unique)
    - day: integer (1-7)
    - title: string
    - description: string
    - resources: array of objects with { type: 'video' | 'article', url: string, title: string }
    Provide exactly 7 steps (one for each day). Use YouTube links for videos where possible.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            day: { type: Type.INTEGER },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            resources: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ['video', 'article'] },
                  url: { type: Type.STRING },
                  title: { type: Type.STRING }
                },
                required: ['type', 'url', 'title']
              }
            }
          },
          required: ['id', 'day', 'title', 'description']
        }
      }
    }
  });

  try {
    const data = JSON.parse(response.text || "[]");
    return data.map((step: any) => ({
      ...step,
      status: 'pending'
    }));
  } catch (e) {
    console.error("Failed to parse roadmap JSON", e);
    return [];
  }
}

export async function generateImage(prompt: string): Promise<string> {
  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{ text: `Educational illustration for students about: ${prompt}. Style: Clean, modern, 3D render, bright colors.` }],
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error('Gagal menghasilkan gambar');
}

export async function generateSummary(text: string): Promise<string> {
  const response = await genAI.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Ringkaslah teks berikut menjadi poin-poin penting yang mudah dipahami pelajar: ${text}`,
  });
  return response.text || "";
}

export async function generateQuiz(topic: string): Promise<QuizQuestion[]> {
  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a 5-question multiple choice quiz for the topic: "${topic}". 
    Return a JSON array of objects with: question, options (array of 4 strings), correctAnswer (index 0-3), and explanation.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.INTEGER },
            explanation: { type: Type.STRING }
          },
          required: ['question', 'options', 'correctAnswer', 'explanation']
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
}

export async function generateFlashcards(content: string): Promise<Flashcard[]> {
  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create 5 flashcards from the following content: "${content}". 
    Return a JSON array of objects with: id, front, back.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            front: { type: Type.STRING },
            back: { type: Type.STRING }
          },
          required: ['id', 'front', 'back']
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
}

export async function textToSpeech(text: string): Promise<string> {
  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio ? `data:audio/mp3;base64,${base64Audio}` : '';
}
