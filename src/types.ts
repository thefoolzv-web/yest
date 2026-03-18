export interface Agent {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  icon: string;
  color: string;
  personality?: 'tutor' | 'buddy' | 'strict';
  traits?: {
    emotion: string; // e.g., "Ceria", "Tenang", "Bersemangat"
    teachingStyle: string; // e.g., "Sokratik", "Visual", "Praktis"
    character: string; // e.g., "Profesor Tua", "Kakak Kelas", "Robot Ramah"
  };
  isMother?: boolean;
  userId?: string;
}

export interface RoadmapStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  day: number; // Tracking harian
  resources?: { type: 'video' | 'article', url: string, title: string }[];
}

export interface Roadmap {
  id: string;
  agentId: string;
  topic: string;
  steps: RoadmapStep[];
  currentDay: number;
  userId?: string;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  userId?: string;
  agentId?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  agentId: string;
  userId?: string;
  type?: 'text' | 'formula' | 'vocab' | 'image';
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
}

export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  lastStudyDate?: string;
  totalMinutes: number;
  badges: Badge[];
}
