import React, { useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, HelpCircle } from 'lucide-react';
import { QuizQuestion } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface QuizProps {
  questions: QuizQuestion[];
  onComplete: (score: number) => void;
  onClose: () => void;
}

export default function Quiz({ questions, onComplete, onClose }: QuizProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const handleAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
    setIsAnswered(true);
    if (index === questions[currentStep].correctAnswer) {
      setScore(s => s + 1);
    }
  };

  const nextStep = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(s => s + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      setShowResult(true);
      onComplete(score);
    }
  };

  if (showResult) {
    return (
      <div className="text-center p-8">
        <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="text-purple-400" size={40} />
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">Kuis Selesai!</h3>
        <p className="text-slate-400 mb-6">Skor Anda: {score} / {questions.length}</p>
        <button 
          onClick={onClose}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all"
        >
          Kembali ke Belajar
        </button>
      </div>
    );
  }

  const q = questions[currentStep];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Pertanyaan {currentStep + 1} dari {questions.length}</span>
        <div className="h-2 w-32 bg-white/5 rounded-full overflow-hidden">
          <div 
            className="h-full bg-purple-500 transition-all duration-500" 
            style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <h3 className="text-xl font-bold text-white mb-8">{q.question}</h3>

      <div className="space-y-3">
        {q.options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => handleAnswer(idx)}
            disabled={isAnswered}
            className={cn(
              "w-full p-4 rounded-2xl text-left border transition-all flex items-center justify-between group",
              isAnswered 
                ? idx === q.correctAnswer
                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                  : idx === selectedOption
                    ? "bg-red-500/10 border-red-500/50 text-red-400"
                    : "bg-white/5 border-white/10 text-slate-500"
                : "bg-white/5 border-white/10 text-slate-300 hover:border-purple-500/50 hover:bg-white/10"
            )}
          >
            <span className="font-medium">{opt}</span>
            {isAnswered && idx === q.correctAnswer && <CheckCircle2 size={18} />}
            {isAnswered && idx === selectedOption && idx !== q.correctAnswer && <XCircle size={18} />}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {isAnswered && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 p-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl"
          >
            <div className="flex items-center gap-2 mb-2 text-purple-400">
              <HelpCircle size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">Penjelasan</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{q.explanation}</p>
            <button 
              onClick={nextStep}
              className="mt-6 w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
            >
              {currentStep === questions.length - 1 ? 'Lihat Hasil' : 'Lanjut'}
              <ArrowRight size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
