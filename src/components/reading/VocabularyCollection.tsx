"use client";

import { useState, useEffect } from "react";

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
            ✕
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-ink-400">
          <div className="text-3xl mb-2">📖</div>
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
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
