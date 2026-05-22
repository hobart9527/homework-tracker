"use client";

import { useState, useEffect } from "react";
import { IconTrash } from "@/components/ui/icons";

interface VocabularyItem {
  word: string;
  language: "zh" | "en";
  pinyin?: string;
  translation?: string;
  addedAt: string;
}

const STORAGE_KEY = "hw-vocabulary-v1";

function loadVocabulary(): VocabularyItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVocabulary(items: VocabularyItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useVocabulary() {
  const [items, setItems] = useState<VocabularyItem[]>([]);

  useEffect(() => {
    setItems(loadVocabulary());
  }, []);

  const addWord = (word: string, language: "zh" | "en", pinyin?: string) => {
    setItems((prev) => {
      if (prev.some((i) => i.word === word)) return prev;
      const next = [...prev, { word, language, pinyin, addedAt: new Date().toISOString() }];
      saveVocabulary(next);
      return next;
    });
  };

  const removeWord = (word: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.word !== word);
      saveVocabulary(next);
      return next;
    });
  };

  return { items, addWord, removeWord };
}

export function VocabularyCollection({ onClose }: { onClose?: () => void }) {
  const { items, removeWord } = useVocabulary();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-forest-800">生词本</h3>
        {onClose && (
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-ink-400">
          <div className="text-3xl mb-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto text-ink-300">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <p>阅读时查词会自动收录到这里</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.word}
              className="flex items-center justify-between p-3 rounded-xl bg-cream-50 hover:bg-cream-100 transition-colors"
            >
              <div>
                <div className="font-bold text-forest-800">{item.word}</div>
                {item.pinyin && (
                  <div className="text-sm text-ink-500">{item.pinyin}</div>
                )}
              </div>
              <button
                onClick={() => removeWord(item.word)}
                className="text-ink-400 hover:text-coral-500 transition-colors"
              >
                <IconTrash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
