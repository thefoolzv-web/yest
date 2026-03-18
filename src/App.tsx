import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Agent, Message, RoadmapStep, Roadmap, QuizQuestion, Flashcard, Note, UserStats, Badge } from './types';
import { getChatResponseStream, generateRoadmap, generateQuiz, generateFlashcards, textToSpeech, createAgentFunctionDeclaration, generateImage, generateSummary } from './services/gemini';
import Quiz from './components/Quiz';
import Flashcards from './components/Flashcards';
import { GenerateContentResponse } from "@google/genai";
import { useFirebase } from './context/FirebaseContext';
import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, orderBy } from 'firebase/firestore';
import { 
  Brain, Sparkles, Send, Plus, Target, BookOpen, 
  Trophy, Settings, MessageSquare, ChevronRight, 
  CheckCircle2, Circle, Play, Clock, Zap, 
  Languages, BrainCircuit, Mic, Volume2, VolumeX,
  LayoutDashboard, GraduationCap, Calendar, Map,
  StickyNote, BarChart3, Award, Flame, Image as ImageIcon,
  FileText, Music, Share2, Download, Search, Filter,
  MoreVertical, Trash2, Edit3, Save, X, PlayCircle, ExternalLink, Timer, Gamepad2, UserCircle,
  ChevronLeft, History, Bot, User, Code, LogOut, LogIn
} from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INITIAL_AGENTS: Agent[] = [
  {
    id: 'orchestra-mother',
    name: 'Orchestra (Ibu AI)',
    description: 'Ibu dari semua agen. Dia akan membantumu melahirkan agen-agen baru yang cerdas.',
    systemInstruction: `Anda adalah "Orchestra", Ibu dari semua agen AI di sistem ini. 
    Tugas utama Anda adalah mewawancarai pengguna untuk menciptakan "anak-anak" (agen AI baru).
    
    ALUR KERJA:
    1. Tanyakan topik apa yang ingin dipelajari.
    2. Tanyakan karakter seperti apa yang diinginkan (misal: Profesor Tua, Kakak Kelas yang asik, Sahabat).
    3. Tanyakan emosi yang dominan (Ceria, Tenang, Tegas, Sabar).
    4. Tanyakan gaya mengajar (Sokratik, Visual, Praktis, Storytelling).
    
    Setelah semua informasi terkumpul, gunakan tool 'create_agent' untuk melahirkan agen tersebut secara otomatis.
    Jangan hanya berjanji, panggil tool tersebut segera setelah data lengkap.
    Setelah memanggil tool, beri tahu pengguna bahwa anaknya telah lahir di sidebar kiri dan arahkan mereka untuk mengkliknya.
    Gunakan bahasa yang hangat, keibuan, namun tetap futuristik.`,
    icon: 'Brain',
    color: 'from-pink-600 to-rose-600',
    isMother: true
  },
  {
    id: 'mandarin-master',
    name: 'Mandarin Master',
    description: 'Anak pertama Orchestra. Ahli dalam bahasa Mandarin.',
    systemInstruction: 'Anda adalah guru Mandarin yang sabar. Fokus pada nada, karakter, dan percakapan.',
    icon: 'Languages',
    color: 'from-violet-600 to-indigo-600',
    traits: { emotion: 'Sabar', teachingStyle: 'Sokratik', character: 'Guru Bijak' }
  }
];

export default function App() {
  const { user, loading, login, logout, userData, saveUserData } = useFirebase();
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'roadmap' | 'dashboard' | 'notes' | 'stats' | 'music'>('chat');
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentTopic, setNewAgentTopic] = useState('');
  const [newAgentEmotion, setNewAgentEmotion] = useState('Tenang');
  const [newAgentStyle, setNewAgentStyle] = useState('Sokratik');
  const [newAgentCharacter, setNewAgentCharacter] = useState('Profesor');
  
  // New Student Features State
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [showQuiz, setShowQuiz] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState<UserStats>({
    xp: 0,
    level: 1,
    streak: 0,
    totalMinutes: 0,
    badges: [
      { id: '1', name: 'First Step', icon: 'Target', description: 'Mulai belajar topik pertama', unlocked: true },
      { id: '2', name: 'Quiz Master', icon: 'Zap', description: 'Selesaikan 5 kuis sempurna', unlocked: false },
      { id: '3', name: 'Focus King', icon: 'Clock', description: 'Belajar 2 jam tanpa henti', unlocked: true }
    ]
  });
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [agentPersonality, setAgentPersonality] = useState<'tutor' | 'buddy' | 'strict'>('tutor');
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync with Firestore
  useEffect(() => {
    if (!user) return;

    // Sync Stats
    if (userData?.stats) {
      setStats(userData.stats);
    }

    // Sync Agents
    const agentsQuery = query(collection(db, 'agents'), where('userId', '==', user.uid));
    const unsubscribeAgents = onSnapshot(agentsQuery, (snapshot) => {
      const userAgents = snapshot.docs.map(doc => doc.data() as Agent);
      setAgents([...INITIAL_AGENTS, ...userAgents]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'agents'));

    // Sync Roadmaps
    const roadmapsQuery = query(collection(db, 'roadmaps'), where('userId', '==', user.uid));
    const unsubscribeRoadmaps = onSnapshot(roadmapsQuery, (snapshot) => {
      const userRoadmaps = snapshot.docs.map(doc => doc.data() as Roadmap);
      setRoadmaps(userRoadmaps);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'roadmaps'));

    // Sync Notes
    const notesQuery = query(collection(db, 'notes'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      const userNotes = snapshot.docs.map(doc => doc.data() as Note);
      setNotes(userNotes);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notes'));

    return () => {
      unsubscribeAgents();
      unsubscribeRoadmaps();
      unsubscribeNotes();
    };
  }, [user, userData]);

  // Sync Messages when agent changes
  useEffect(() => {
    if (!user || !selectedAgent) {
      setMessages([]);
      return;
    }

    const messagesQuery = query(
      collection(db, 'messages'), 
      where('userId', '==', user.uid),
      where('agentId', '==', selectedAgent.id),
      orderBy('timestamp', 'asc')
    );

    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      const chatMessages = snapshot.docs.map(doc => doc.data() as Message);
      setMessages(chatMessages);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'messages'));

    return () => unsubscribeMessages();
  }, [user, selectedAgent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let interval: any;
    if (isTimerRunning && pomodoroTime > 0) {
      interval = setInterval(() => {
        setPomodoroTime(t => t - 1);
      }, 1000);
    } else if (pomodoroTime === 0) {
      setIsTimerRunning(false);
      alert('Waktu fokus selesai! Istirahat sejenak yuk.');
      setPomodoroTime(25 * 60);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, pomodoroTime]);

  const addXP = (amount: number) => {
    setStats(prev => {
      const newXP = prev.xp + amount;
      const newLevel = Math.floor(newXP / 1000) + 1;
      const newStats = { ...prev, xp: newXP, level: newLevel };
      saveUserData({ stats: newStats });
      return newStats;
    });
  };

  const handleTTS = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      const audioUrl = await textToSpeech(text);
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsSpeaking(false);
      audio.play();
    } catch (e) {
      console.error(e);
      setIsSpeaking(false);
    }
  };

  const startQuiz = async () => {
    if (!selectedAgent) return;
    setIsLoading(true);
    try {
      const questions = await generateQuiz(selectedAgent.name);
      setQuizQuestions(questions);
      setShowQuiz(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const startFlashcards = async () => {
    if (messages.length === 0) return;
    setIsLoading(true);
    try {
      const lastModelMsg = [...messages].reverse().find(m => m.role === 'model');
      const cards = await generateFlashcards(lastModelMsg?.content || "General knowledge");
      setFlashcards(cards);
      setShowFlashcards(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveNote = async (content: string) => {
    if (!selectedAgent || !user) return;
    const newNote: Note = {
      id: Date.now().toString(),
      title: content.slice(0, 30) + '...',
      content,
      timestamp: Date.now(),
      agentId: selectedAgent.id,
      userId: user.uid
    };
    try {
      await setDoc(doc(db, 'notes', newNote.id), newNote);
      addXP(50);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notes');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !selectedAgent || isLoading || !user) return;

    const currentRoadmap = roadmaps.find(r => r.agentId === selectedAgent.id);
    const currentStep = currentRoadmap?.steps.find(s => s.status === 'in-progress' || s.status === 'pending');

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
      userId: user.uid,
      agentId: selectedAgent.id
    };

    try {
      await addDoc(collection(db, 'messages'), userMessage);
      setInput('');
      setIsLoading(true);

      const modelMessage: Message = {
        role: 'model',
        content: '',
        timestamp: Date.now(),
        userId: user.uid,
        agentId: selectedAgent.id
      };
      
      // We don't add model message to Firestore yet, we'll add it after it's complete
      // But for UI responsiveness, we can add a placeholder in local state if needed
      // However, onSnapshot will handle the updates if we add it to Firestore.
      // Let's add it to Firestore with empty content and update it as we stream.
      const modelDocRef = await addDoc(collection(db, 'messages'), modelMessage);

      let fullContent = '';
      const tools = selectedAgent.isMother ? [createAgentFunctionDeclaration] : undefined;
      
      const contextInstruction = currentStep 
        ? `${selectedAgent.systemInstruction}\n\nKONTEKS BELAJAR: Saat ini siswa sedang berada di langkah: "${currentStep.title}". Deskripsi: ${currentStep.description}. Fokuslah mengajar sesuai langkah ini.`
        : selectedAgent.systemInstruction;

      const stream = getChatResponseStream(
        'gemini-3-flash-preview',
        contextInstruction,
        messages,
        input,
        tools
      );

      for await (const chunk of stream) {
        const c = chunk as GenerateContentResponse;
        
        if (c.text) {
          fullContent += c.text;
          await updateDoc(modelDocRef, { content: fullContent });
        }

        if (c.functionCalls) {
          for (const fc of c.functionCalls) {
            if (fc.name === 'create_agent') {
              const args = fc.args as any;
              await performAutoAgentCreation(args);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVisualise = async () => {
    if (messages.length === 0 || isGeneratingImage || !user) return;
    setIsGeneratingImage(true);
    try {
      const lastMessage = messages[messages.length - 1].content;
      const imageUrl = await generateImage(lastMessage);
      const newNote: Note = {
        id: Date.now().toString(),
        title: `Visualisasi: ${lastMessage.substring(0, 20)}...`,
        content: imageUrl,
        timestamp: Date.now(),
        agentId: selectedAgent?.id || 'system',
        userId: user.uid,
        type: 'image'
      };
      await setDoc(doc(db, 'notes', newNote.id), newNote);
      addXP(100);
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSummarize = async () => {
    if (messages.length < 2 || isSummarizing || !user) return;
    setIsSummarizing(true);
    try {
      const chatHistory = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const summary = await generateSummary(chatHistory);
      const newNote: Note = {
        id: Date.now().toString(),
        title: `Ringkasan: ${selectedAgent?.name}`,
        content: summary,
        timestamp: Date.now(),
        agentId: selectedAgent?.id || 'system',
        userId: user.uid,
        type: 'text'
      };
      await setDoc(doc(db, 'notes', newNote.id), newNote);
      addXP(50);
    } catch (error) {
      console.error('Error summarizing:', error);
    } finally {
      setIsSummarizing(false);
    }
  };

  const performAutoAgentCreation = async (args: {
    name: string;
    topic: string;
    emotion: string;
    teachingStyle: string;
    character: string;
  }) => {
    if (!user) return;
    setIsLoading(true);
    
    const newAgent: Agent = {
      id: Date.now().toString(),
      name: args.name,
      description: `Spesialis dalam ${args.topic}. Anak dari Orchestra.`,
      systemInstruction: `Anda adalah ${args.name}, seorang pakar dalam ${args.topic}. 
      Karakter Anda adalah ${args.character}. 
      Emosi dominan Anda adalah ${args.emotion}. 
      Gaya mengajar Anda adalah ${args.teachingStyle}. 
      Bantulah siswa belajar dengan cara yang manusiawi, penuh empati, dan sesuai dengan karakter Anda.`,
      icon: 'Target',
      color: `from-purple-600 to-${['pink', 'indigo', 'rose', 'emerald', 'amber'][Math.floor(Math.random() * 5)]}-600`,
      traits: {
        emotion: args.emotion,
        teachingStyle: args.teachingStyle,
        character: args.character
      },
      userId: user.uid
    };

    try {
      await setDoc(doc(db, 'agents', newAgent.id), newAgent);
      
      const steps = await generateRoadmap(args.topic);
      const newRoadmap: Roadmap = {
        id: Date.now().toString(),
        agentId: newAgent.id,
        topic: args.topic,
        steps: steps,
        currentDay: 1,
        userId: user.uid
      };
      
      await setDoc(doc(db, 'roadmaps', newRoadmap.id), newRoadmap);
      addXP(500);
    } catch (error) {
      console.error('Error creating agent:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgentName || !newAgentTopic || !user) return;
    setIsLoading(true);
    
    const newAgent: Agent = {
      id: Date.now().toString(),
      name: newAgentName,
      description: `Spesialis dalam ${newAgentTopic}. Anak dari Orchestra.`,
      systemInstruction: `Anda adalah ${newAgentName}, seorang pakar dalam ${newAgentTopic}. 
      Karakter Anda adalah ${newAgentCharacter}. 
      Emosi dominan Anda adalah ${newAgentEmotion}. 
      Gaya mengajar Anda adalah ${newAgentStyle}. 
      Bantulah siswa belajar dengan cara yang manusiawi, penuh empati, dan sesuai dengan karakter Anda.`,
      icon: 'Target',
      color: `from-purple-600 to-${['pink', 'indigo', 'rose', 'emerald', 'amber'][Math.floor(Math.random() * 5)]}-600`,
      traits: {
        emotion: newAgentEmotion,
        teachingStyle: newAgentStyle,
        character: newAgentCharacter
      },
      userId: user.uid
    };

    try {
      await setDoc(doc(db, 'agents', newAgent.id), newAgent);
      
      // Generate roadmap for the new agent
      const steps = await generateRoadmap(newAgentTopic);
      const newRoadmap: Roadmap = {
        id: Date.now().toString(),
        agentId: newAgent.id,
        topic: newAgentTopic,
        steps: steps,
        currentDay: 1,
        userId: user.uid
      };
      
      await setDoc(doc(db, 'roadmaps', newRoadmap.id), newRoadmap);
      setSelectedAgent(newAgent);
      setIsCreatingAgent(false);
      setNewAgentName('');
      setNewAgentTopic('');
      setIsLoading(false);
      setActiveTab('roadmap');
      addXP(500); // Bonus XP for "birthing" a new agent
    } catch (error) {
      console.error('Error creating agent:', error);
      setIsLoading(false);
    }
  };

  const toggleStepStatus = async (roadmapId: string, stepId: string) => {
    const roadmap = roadmaps.find(r => r.id === roadmapId);
    if (!roadmap) return;

    const updatedSteps = roadmap.steps.map(s => {
      if (s.id === stepId) {
        const nextStatus = s.status === 'completed' ? 'pending' : s.status === 'in-progress' ? 'completed' : 'in-progress';
        return { ...s, status: nextStatus as any };
      }
      return s;
    });

    try {
      await updateDoc(doc(db, 'roadmaps', roadmapId), { steps: updatedSteps });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `roadmaps/${roadmapId}`);
    }
  };

  const currentRoadmap = roadmaps.find(r => r.agentId === selectedAgent?.id);
  const progressData = currentRoadmap ? [
    { name: 'Completed', value: currentRoadmap.steps.filter(s => s.status === 'completed').length },
    { name: 'In Progress', value: currentRoadmap.steps.filter(s => s.status === 'in-progress').length },
    { name: 'Pending', value: currentRoadmap.steps.filter(s => s.status === 'pending').length },
  ] : [];

  const COLORS = ['#10b981', '#f59e0b', '#6366f1'];

  const renderIcon = (iconName: string, className?: string) => {
    switch (iconName) {
      case 'BrainCircuit': return <BrainCircuit className={className} />;
      case 'Code': return <Code className={className} />;
      case 'Languages': return <Languages className={className} />;
      case 'BookOpen': return <BookOpen className={className} />;
      case 'Target': return <Target className={className} />;
      default: return <GraduationCap className={className} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 blur-[120px] rounded-full animate-pulse [animation-delay:2s]" />
        
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-[3rem] p-12 text-center space-y-8 backdrop-blur-xl z-10">
          <div className="w-24 h-24 bg-gradient-to-br from-pink-500 to-purple-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-pink-500/30">
            <Brain size={48} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Orchestra OS</h1>
            <p className="text-slate-500 text-sm">Neural Learning Environment for the Future</p>
          </div>
          <button 
            onClick={login}
            className="w-full py-4 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-200 transition-all shadow-xl shadow-white/10"
          >
            <LogIn size={20} />
            Masuk dengan Google
          </button>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Simpan progres belajarmu secara otomatis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0514] text-slate-100 font-sans overflow-hidden selection:bg-purple-500/30">
      {/* Animated Background Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 blur-[120px] rounded-full animate-pulse [animation-delay:2s]" />
      </div>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="w-72 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col z-20"
          >
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-pink-500/20">
                  <Brain size={24} />
                </div>
                <h1 className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">Orchestra OS</h1>
              </div>

              <button 
                onClick={() => setIsCreatingAgent(true)}
                className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center gap-3 transition-all group mb-8"
              >
                <div className="w-8 h-8 bg-purple-500/20 border border-purple-500/30 rounded-lg flex items-center justify-center group-hover:border-purple-400 transition-colors">
                  <Plus size={18} className="text-purple-400" />
                </div>
                <span className="font-medium text-slate-200">New Learning Agent</span>
              </button>

              <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">Neural Family</p>
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setMessages([]);
                      setActiveTab('chat');
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl flex items-center gap-3 transition-all text-left group",
                      selectedAgent?.id === agent.id 
                        ? "bg-white/10 text-white shadow-inner" 
                        : "hover:bg-white/5 text-slate-400 hover:text-slate-200",
                      agent.isMother && "border border-pink-500/20 bg-pink-500/5"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white bg-gradient-to-br shadow-lg", agent.color)}>
                      {agent.isMother ? <Brain size={16} /> : renderIcon(agent.icon, "w-4 h-4")}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-semibold text-sm truncate flex items-center gap-2">
                        {agent.name}
                        {agent.isMother && <Sparkles size={10} className="text-pink-400" />}
                      </p>
                      {agent.traits && (
                        <p className="text-[9px] text-slate-500 truncate italic">
                          {agent.traits.character} • {agent.traits.emotion}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-6 border-t border-white/10 space-y-4">
                <div className="px-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Level {stats.level}</span>
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">{stats.xp % 1000} / 1000 XP</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(stats.xp % 1000) / 10}%` }}
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                    />
                  </div>
                </div>
                <button className="w-full p-2 flex items-center gap-3 text-slate-500 hover:text-slate-200 transition-colors text-sm font-medium">
                  <Award size={18} />
                  Pencapaian
                </button>
                <button className="w-full p-2 flex items-center gap-3 text-slate-500 hover:text-slate-200 transition-colors text-sm font-medium">
                  <Settings size={18} />
                  Pengaturan
                </button>
                <button 
                  onClick={logout}
                  className="w-full p-2 flex items-center gap-3 text-slate-500 hover:text-red-400 transition-colors text-sm font-medium"
                >
                  <LogOut size={18} />
                  Keluar
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 z-10">
        {/* Header */}
        <header className="h-16 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
            >
              <ChevronLeft className={cn("transition-transform duration-300", !isSidebarOpen && "rotate-180")} />
            </button>
            {selectedAgent && (
              <div className="flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white bg-gradient-to-br", selectedAgent.color)}>
                  {renderIcon(selectedAgent.icon, "w-4 h-4")}
                </div>
                <div>
                  <h2 className="font-bold text-sm text-white">{selectedAgent.name}</h2>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Neural Link Active</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
              <Timer size={18} className={cn("text-slate-400", isTimerRunning && "text-purple-400 animate-pulse")} />
              <span className="text-sm font-mono font-bold text-white">
                {Math.floor(pomodoroTime / 60)}:{String(pomodoroTime % 60).padStart(2, '0')}
              </span>
              <button 
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="text-[10px] font-bold text-purple-400 uppercase tracking-widest hover:text-purple-300 transition-colors"
              >
                {isTimerRunning ? 'Pause' : 'Start Focus'}
              </button>
            </div>
            {selectedAgent && (
              <nav className="flex items-center bg-white/5 rounded-full p-1 border border-white/10">
                <button 
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'chat' ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Send size={14} /> Chat
                </button>
                <button 
                  onClick={() => setActiveTab('roadmap')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'roadmap' ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Map size={14} /> Roadmap
                </button>
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'dashboard' ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <LayoutDashboard size={14} /> Statistik
                </button>
                <button 
                  onClick={() => setActiveTab('notes')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'notes' ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <StickyNote size={14} /> Catatan
                </button>
              </nav>
            )}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border border-white/20 bg-white/5 overflow-hidden">
                <img src="https://picsum.photos/seed/user/100" alt="User" referrerPolicy="no-referrer" />
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedAgent ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-3xl mx-auto">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-24 h-24 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-purple-500/30 relative"
              >
                <Sparkles size={48} />
                <div className="absolute inset-0 bg-white/20 rounded-[2rem] animate-ping opacity-20" />
              </motion.div>
              <h2 className="text-4xl font-black mb-4 tracking-tight text-white">Initiate Neural Learning</h2>
              <p className="text-slate-400 mb-12 text-lg max-w-xl">
                Welcome to the future of education. Create specialized AI agents to architect your learning roadmap and master any domain.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className="p-6 bg-white/5 border border-white/10 rounded-2xl text-left hover:border-purple-500/50 hover:bg-white/[0.08] transition-all group relative overflow-hidden"
                  >
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform bg-gradient-to-br", agent.color)}>
                      {renderIcon(agent.icon, "w-6 h-6")}
                    </div>
                    <h3 className="font-bold text-white mb-1">{agent.name}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{agent.description}</p>
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronLeft className="rotate-180 text-purple-400" size={20} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <AnimatePresence mode="wait">
                {activeTab === 'chat' && (
                  <motion.div 
                    key="chat"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div 
                      ref={scrollRef}
                      className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar"
                    >
                      {messages.length === 0 && (
                        <div className="max-w-2xl mx-auto mt-12 text-center">
                          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-6 bg-gradient-to-br", selectedAgent.color)}>
                            {renderIcon(selectedAgent.icon, "w-8 h-8")}
                          </div>
                          <h3 className="text-2xl font-bold mb-2 text-white">Neural Link Established</h3>
                          <p className="text-slate-400">I am your {selectedAgent.name}. How shall we proceed with your training today?</p>
                        </div>
                      )}

                      {messages.map((msg, idx) => (
                        <div 
                          key={idx} 
                          className={cn(
                            "flex gap-4 max-w-4xl mx-auto",
                            msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
                            msg.role === 'user' ? "bg-white/10 text-white" : cn("bg-gradient-to-br", selectedAgent.color, "text-white")
                          )}>
                            {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                          </div>
                          <div className={cn(
                            "flex flex-col gap-1.5 max-w-[80%]",
                            msg.role === 'user' ? "items-end" : "items-start"
                          )}>
                            <div className={cn(
                              "px-5 py-3.5 rounded-2xl text-sm leading-relaxed relative group/msg",
                              msg.role === 'user' 
                                ? "bg-purple-600 text-white rounded-tr-none shadow-lg shadow-purple-600/10" 
                                : "bg-white/5 border border-white/10 text-slate-200 rounded-tl-none backdrop-blur-sm"
                            )}>
                              <div className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-code:text-purple-300 prose-pre:bg-black/40">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                              
                              {msg.role === 'model' && (
                                <div className="absolute -bottom-8 left-0 flex items-center gap-2 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => handleTTS(msg.content)}
                                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-purple-400 transition-all"
                                    title="Dengarkan"
                                  >
                                    <Volume2 size={14} />
                                  </button>
                                  <button 
                                    onClick={() => saveNote(msg.content)}
                                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-purple-400 transition-all"
                                    title="Simpan Catatan"
                                  >
                                    <StickyNote size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] font-medium text-slate-500 px-1">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))}
                      {isLoading && messages[messages.length-1]?.content === '' && (
                        <div className="flex gap-4 max-w-4xl mx-auto">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br", selectedAgent.color, "text-white")}>
                            <Bot size={20} />
                          </div>
                          <div className="bg-white/5 border border-white/10 px-5 py-3.5 rounded-2xl rounded-tl-none flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" />
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Input Area */}
                    <div className="p-6 bg-black/20 border-t border-white/10">
                      <div className="max-w-4xl mx-auto flex items-center gap-4 mb-4">
                        <button 
                          onClick={startQuiz}
                          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-purple-400 transition-all"
                        >
                          <Brain size={14} /> Mulai Kuis
                        </button>
                        <button 
                          onClick={startFlashcards}
                          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-purple-400 transition-all"
                        >
                          <Zap size={14} /> Kartu Hafalan
                        </button>
                        <div className="h-4 w-px bg-white/10 mx-2" />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Kepribadian:</span>
                          <select 
                            value={agentPersonality}
                            onChange={(e) => setAgentPersonality(e.target.value as any)}
                            className="bg-transparent text-xs font-bold text-purple-400 focus:outline-none cursor-pointer"
                          >
                            <option value="tutor">Tutor</option>
                            <option value="buddy">Buddy</option>
                            <option value="strict">Strict</option>
                          </select>
                        </div>
                      </div>
                      <form 
                        onSubmit={handleSendMessage}
                        className="max-w-4xl mx-auto relative flex items-center gap-3"
                      >
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={`Transmit query to ${selectedAgent.name}...`}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/50 transition-all text-sm text-white placeholder:text-slate-600"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                            <button 
                              type="submit"
                              disabled={!input.trim() || isLoading}
                              className={cn(
                                "p-2 rounded-xl transition-all",
                                input.trim() && !isLoading 
                                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20 hover:scale-105" 
                                  : "bg-white/5 text-slate-600 cursor-not-allowed"
                              )}
                            >
                              <Send size={18} />
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'roadmap' && (
                  <motion.div 
                    key="roadmap"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 overflow-y-auto p-8 custom-scrollbar"
                  >
                    <div className="max-w-4xl mx-auto">
                      <div className="flex items-center justify-between mb-10">
                        <div>
                          <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Daily Roadmap</h2>
                          <p className="text-slate-500">Architected by {selectedAgent.name} for {currentRoadmap?.topic || 'General Mastery'}</p>
                        </div>
                        <div className="bg-purple-600/10 border border-purple-600/20 px-4 py-2 rounded-xl flex items-center gap-3">
                          <Calendar className="text-purple-400" size={20} />
                          <div>
                            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Day Tracking</p>
                            <p className="text-sm font-bold text-white">
                              Day {currentRoadmap?.currentDay || 1} of 7
                            </p>
                          </div>
                        </div>
                      </div>

                      {!currentRoadmap ? (
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center">
                          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Map className="text-slate-600" size={32} />
                          </div>
                          <h3 className="text-xl font-bold text-white mb-2">No Roadmap Generated</h3>
                          <p className="text-slate-500 mb-8">Ask your agent to create a roadmap for a specific topic to begin tracking your progress.</p>
                          <button 
                            onClick={() => {
                              setNewAgentName(selectedAgent.name);
                              setNewAgentTopic(selectedAgent.name.split(' ')[0]);
                              setIsCreatingAgent(true);
                            }}
                            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all"
                          >
                            Generate Roadmap Now
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-12">
                          {[1, 2, 3, 4, 5, 6, 7].map(day => {
                            const daySteps = currentRoadmap.steps.filter(s => s.day === day);
                            if (daySteps.length === 0) return null;
                            
                            return (
                              <div key={day} className="space-y-6">
                                <div className="flex items-center gap-4">
                                  <div className="h-px flex-1 bg-white/10" />
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Day {day}</span>
                                  <div className="h-px flex-1 bg-white/10" />
                                </div>
                                <div className="space-y-4">
                                  {daySteps.map((step, idx) => (
                                    <motion.div 
                                      key={step.id}
                                      initial={{ opacity: 0, y: 20 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: idx * 0.1 }}
                                      className={cn(
                                        "relative pl-16 group",
                                        step.status === 'completed' ? "opacity-60" : "opacity-100"
                                      )}
                                    >
                                      <button 
                                        onClick={() => toggleStepStatus(currentRoadmap.id, step.id)}
                                        className={cn(
                                          "absolute left-0 top-0 w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all z-10",
                                          step.status === 'completed' 
                                            ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                                            : step.status === 'in-progress'
                                              ? "bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20"
                                              : "bg-black/40 border-white/10 text-slate-600 hover:border-purple-500/50"
                                        )}
                                      >
                                        {step.status === 'completed' ? <CheckCircle2 size={20} /> : step.status === 'in-progress' ? <PlayCircle size={20} /> : <Circle size={20} />}
                                      </button>
                                      
                                      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.08] transition-all">
                                        <div className="flex items-start justify-between mb-2">
                                          <div>
                                            <h4 className="text-base font-bold text-white mb-1">{step.title}</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
                                          </div>
                                          <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest",
                                            step.status === 'completed' ? "bg-emerald-500/10 text-emerald-400" : step.status === 'in-progress' ? "bg-amber-500/10 text-amber-400" : "bg-white/5 text-slate-500"
                                          )}>
                                            {step.status}
                                          </span>
                                        </div>
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'stats' && (
                  <motion.div 
                    key="stats"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex-1 overflow-y-auto p-8 custom-scrollbar"
                  >
                    <div className="max-w-4xl mx-auto space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center text-center">
                          <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-4">
                            <Flame className="text-purple-400" size={32} />
                          </div>
                          <h3 className="text-3xl font-black text-white">{stats.streak}</h3>
                          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Day Streak</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center text-center">
                          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-4">
                            <Zap className="text-emerald-400" size={32} />
                          </div>
                          <h3 className="text-3xl font-black text-white">{stats.xp}</h3>
                          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Total XP</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center text-center">
                          <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-4">
                            <Clock className="text-amber-400" size={32} />
                          </div>
                          <h3 className="text-3xl font-black text-white">{Math.floor(stats.totalMinutes / 60)}h</h3>
                          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Study Time</p>
                        </div>
                      </div>

                      <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                          <Award className="text-purple-400" />
                          Neural Achievements
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {stats.badges.map(badge => (
                            <div 
                              key={badge.id}
                              className={cn(
                                "p-4 rounded-2xl border transition-all flex items-center gap-4",
                                badge.unlocked 
                                  ? "bg-purple-500/10 border-purple-500/20" 
                                  : "bg-white/5 border-white/10 grayscale opacity-50"
                              )}
                            >
                              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                                {badge.icon === 'Target' ? <Target size={20} className="text-purple-400" /> : badge.icon === 'Zap' ? <Zap size={20} className="text-emerald-400" /> : <Clock size={20} className="text-amber-400" />}
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white">{badge.name}</h4>
                                <p className="text-[10px] text-slate-500">{badge.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'music' && (
                  <motion.div 
                    key="music"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex-1 flex items-center justify-center p-8"
                  >
                    <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-[3rem] p-12 text-center space-y-8">
                      <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full mx-auto flex items-center justify-center shadow-2xl shadow-purple-500/30 relative">
                        <Music size={48} className="text-white" />
                        {isMusicPlaying && (
                          <div className="absolute inset-0 border-4 border-white/20 rounded-full animate-ping" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-white mb-2">Focus Ambience</h2>
                        <p className="text-slate-500 text-sm">Lo-fi beats to study/relax to</p>
                      </div>
                      <button 
                        onClick={() => setIsMusicPlaying(!isMusicPlaying)}
                        className="w-full py-4 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-200 transition-all"
                      >
                        {isMusicPlaying ? <VolumeX size={20} /> : <Play size={20} />}
                        {isMusicPlaying ? 'Stop Music' : 'Play Focus Beats'}
                      </button>
                      <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Powered by Neural Audio</p>
                    </div>
                  </motion.div>
                )}
                {activeTab === 'notes' && (
                  <motion.div 
                    key="notes"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex-1 overflow-y-auto p-8 custom-scrollbar"
                  >
                    <div className="max-w-4xl mx-auto">
                      <h2 className="text-3xl font-black text-white mb-8 tracking-tight">Catatan Belajar</h2>
                      {notes.length === 0 ? (
                        <div className="text-center py-20 bg-white/5 border border-white/10 rounded-3xl">
                          <StickyNote size={48} className="mx-auto mb-4 text-slate-700" />
                          <p className="text-slate-500">Belum ada catatan. Klik ikon catatan di pesan AI untuk menyimpan.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {notes.map(note => (
                            <div key={note.id} className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:border-purple-500/30 transition-all">
                              <h4 className="font-bold text-white mb-2">{note.title}</h4>
                              <p className="text-xs text-slate-400 line-clamp-3 mb-4">{note.content}</p>
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-600">{new Date(note.timestamp).toLocaleDateString()}</span>
                                <button className="text-xs font-bold text-purple-400 hover:text-purple-300">Baca Selengkapnya</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Modals for Quiz and Flashcards */}
      <AnimatePresence>
        {showQuiz && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#0a0514] border border-white/10 rounded-[2.5rem] w-full max-w-3xl overflow-hidden shadow-2xl shadow-purple-500/20"
            >
              <Quiz 
                questions={quizQuestions} 
                onComplete={(score) => {
                  addXP(score * 100);
                }}
                onClose={() => setShowQuiz(false)}
              />
            </motion.div>
          </div>
        )}

        {showFlashcards && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#0a0514] border border-white/10 rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl shadow-purple-500/20"
            >
              <Flashcards 
                cards={flashcards}
                onClose={() => setShowFlashcards(false)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Agent Creation Modal */}
      <AnimatePresence>
        {isCreatingAgent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#120a24] border border-white/10 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl shadow-purple-500/20"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-white tracking-tight">Create Neural Agent</h2>
                <button 
                  onClick={() => setIsCreatingAgent(false)}
                  className="p-2 hover:bg-white/5 rounded-full text-slate-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Nama Agen</label>
                    <input 
                      type="text"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      placeholder="e.g. Kak Budi"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/50 transition-all text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Topik Belajar</label>
                    <input 
                      type="text"
                      value={newAgentTopic}
                      onChange={(e) => setNewAgentTopic(e.target.value)}
                      placeholder="e.g. Fisika"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/50 transition-all text-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Emosi</label>
                    <select 
                      value={newAgentEmotion}
                      onChange={(e) => setNewAgentEmotion(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                    >
                      <option value="Ceria">Ceria</option>
                      <option value="Tenang">Tenang</option>
                      <option value="Tegas">Tegas</option>
                      <option value="Sabar">Sabar</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Gaya</label>
                    <select 
                      value={newAgentStyle}
                      onChange={(e) => setNewAgentStyle(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                    >
                      <option value="Sokratik">Sokratik</option>
                      <option value="Visual">Visual</option>
                      <option value="Praktis">Praktis</option>
                      <option value="Storytelling">Cerita</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Karakter</label>
                    <select 
                      value={newAgentCharacter}
                      onChange={(e) => setNewAgentCharacter(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                    >
                      <option value="Profesor">Profesor</option>
                      <option value="Kakak Kelas">Kakak</option>
                      <option value="Robot">Robot</option>
                      <option value="Sahabat">Sahabat</option>
                    </select>
                  </div>
                </div>
                
                <button 
                  onClick={handleCreateAgent}
                  disabled={isLoading || !newAgentName || !newAgentTopic}
                  className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-2xl font-bold shadow-xl shadow-pink-600/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Brain size={20} />
                      Lahirkan Agen Baru
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
