import React, { useState } from 'react';
import { RotateCcw, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Flashcard } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface FlashcardsProps {
  cards: Flashcard[];
  onClose: () => void;
}

export default function Flashcards({ cards, onClose }: FlashcardsProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const next = () => {
    if (currentIdx < cards.length - 1) {
      setCurrentIdx(s => s + 1);
      setIsFlipped(false);
    }
  };

  const prev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(s => s - 1);
      setIsFlipped(false);
    }
  };

  const card = cards[currentIdx];

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Kartu {currentIdx + 1} dari {cards.length}</span>
        <button 
          onClick={onClose}
          className="text-slate-500 hover:text-white transition-colors"
        >
          Tutup
        </button>
      </div>

      <div className="perspective-1000 h-80 relative group cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
        <motion.div 
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="w-full h-full relative preserve-3d"
        >
          {/* Front */}
          <div className="absolute inset-0 backface-hidden bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-2xl shadow-purple-500/5 group-hover:border-purple-500/30 transition-all">
            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 mb-6">
              <Sparkles size={24} />
            </div>
            <h3 className="text-2xl font-bold text-white leading-tight">{card.front}</h3>
            <p className="mt-8 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Klik untuk membalik</p>
          </div>

          {/* Back */}
          <div className="absolute inset-0 backface-hidden bg-purple-600 border border-purple-500 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-2xl shadow-purple-600/20 rotate-y-180">
            <h3 className="text-2xl font-bold text-white leading-tight">{card.back}</h3>
            <p className="mt-8 text-[10px] font-bold text-white/50 uppercase tracking-widest">Klik untuk membalik</p>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center justify-center gap-6 mt-12">
        <button 
          onClick={(e) => { e.stopPropagation(); prev(); }}
          disabled={currentIdx === 0}
          className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-purple-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft size={24} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); setIsFlipped(!isFlipped); }}
          className="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/20 hover:scale-110 transition-all"
        >
          <RotateCcw size={20} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); next(); }}
          disabled={currentIdx === cards.length - 1}
          className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-purple-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}} />
    </div>
  );
}
