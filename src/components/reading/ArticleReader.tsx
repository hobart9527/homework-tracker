"use client";

import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { useReadingProgress } from "./useReadingProgress";
import { useRouter } from "next/navigation";

export interface ArticleReaderArticle {
  id: string;
  title: string;
  content: string;
  gradeLevel: number;
  category: string;
  wordCount: number;
  estimatedMinutes: number;
  coverImageUrl?: string;
  pinyinContent?: string;
  classicalQuote?: {
    original: string;
    pinyin: string;
    translation: string;
  };
  language?: "zh" | "en";
  illustrations?: Array<{
    paragraph_index: number;
    image_url: string;
    scene_description?: string;
  }>;
}

interface ArticleReaderProps {
  article: ArticleReaderArticle;
  onStartQuiz: () => void;
}

export interface ArticleReaderRef {
  toggleTTS: () => void;
  stopTTS: () => void;
  isPlaying: boolean;
  isPaused: boolean;
}

export const ArticleReader = forwardRef<ArticleReaderRef, ArticleReaderProps>(function ArticleReader(
  { article, onStartQuiz },
  ref
) {
  const router = useRouter();
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(null);
  const [activeCharRange, setActiveCharRange] = useState<[number, number] | null>(null);
  const [dictLookup, setDictLookup] = useState<{
    word: string;
    x: number;
    y: number;
  } | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Landscape detection
  useEffect(() => {
    const check = () => {
      setIsLandscape(window.innerWidth >= 1024 && window.innerWidth > window.innerHeight);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Split content into paragraphs
  const displayContent =
    article.language === "zh" && article.pinyinContent
      ? article.pinyinContent
      : article.content;

  const paragraphs = useMemo(() => {
    return displayContent
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }, [displayContent]);

  const illustrationMap = useMemo(() => {
    const map = new Map<
      number,
      NonNullable<ArticleReaderArticle["illustrations"]>[number]
    >();
    article.illustrations?.forEach((ill) => {
      map.set(ill.paragraph_index, ill);
    });
    return map;
  }, [article.illustrations]);

  const { progress, currentParagraph } = useReadingProgress(
    article.id,
    paragraphs.length
  );

  // Auto-scroll to saved position on initial load (scroll mode only)
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (
      isLandscape ||
      hasScrolledRef.current ||
      currentParagraph === 0 ||
      paragraphs.length === 0
    ) {
      return;
    }

    // Delay slightly to ensure DOM is ready
    const timer = setTimeout(() => {
      const target = document.querySelector(
        `[data-paragraph-index="${currentParagraph}"]`
      );
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        hasScrolledRef.current = true;
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isLandscape, currentParagraph, paragraphs.length]);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.speechSynthesis) {
      setTtsSupported(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Helper function to get pinyin for a character
  const getPinyinForChar = useCallback((char: string): string => {
    if (!article.pinyinContent) return "";
    // Simple regex to find pinyin for a character
    const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`([${escapedChar}])\\(([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+)\\)`, 'g');
    const match = regex.exec(article.pinyinContent);
    return match ? match[2] : "";
  }, [article.pinyinContent]);

  // Handle text click for dictionary lookup
  const handleTextClick = useCallback((e: React.MouseEvent, text: string) => {
    // Get click position
    const rect = e.currentTarget.getBoundingClientRect();

    // For Chinese text, try to get the clicked character
    if (article.language === "zh" && article.pinyinContent) {
      // Use a simple approach - find which character was clicked based on position
      // Strip pinyin markers for character count
      const cleanText = text.replace(/\([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+\)/g, '');
      const clickX = e.clientX - rect.left;
      const avgCharWidth = rect.width / cleanText.length;
      const charIndex = Math.floor(clickX / avgCharWidth);
      const clickedChar = cleanText[charIndex];

      if (clickedChar) {
        setDictLookup({
          word: clickedChar,
          x: e.clientX,
          y: e.clientY,
        });
      }
    } else {
      // For English, use word splitting
      const selection = window.getSelection();
      const word = selection?.toString().trim() || text.split(' ')[0] || "";
      if (word) {
        setDictLookup({
          word,
          x: e.clientX,
          y: e.clientY,
        });
      }
    }
  }, [article.language, article.pinyinContent]);

  const handleTTS = useCallback(() => {
    if (!window.speechSynthesis) return;

    if (ttsPlaying && !ttsPaused) {
      window.speechSynthesis.pause();
      setTtsPaused(true);
      return;
    }

    if (ttsPaused) {
      window.speechSynthesis.resume();
      setTtsPaused(false);
      return;
    }

    window.speechSynthesis.cancel();

    const ttsContent =
      article.language === "zh" && article.pinyinContent
        ? article.pinyinContent.replace(/\([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+\)/g, "")
        : article.content;

    const utterance = new SpeechSynthesisUtterance(ttsContent);
    utterance.lang = article.language === "zh" ? "zh-CN" : "en-US";
    utterance.rate = article.gradeLevel <= 3 ? 0.8 : 1.0;

    // Track character position for word-level highlighting
    utterance.onboundary = (event) => {
      const charIndex = event.charIndex;

      // Find which paragraph and the offset within that paragraph
      let charCount = 0;
      for (let i = 0; i < paragraphs.length; i++) {
        // Add 1 for the newline separator
        const paragraphLength = paragraphs[i].length + 1;
        if (charIndex < charCount + paragraphLength) {
          const offsetInParagraph = charIndex - charCount;
          setActiveParagraphIndex(i);
          setActiveCharRange([offsetInParagraph, offsetInParagraph + 1]);
          return;
        }
        charCount += paragraphLength;
      }
    };

    utterance.onend = () => {
      setTtsPlaying(false);
      setTtsPaused(false);
      setActiveParagraphIndex(null);
      setActiveCharRange(null);
    };
    utterance.onerror = () => {
      setTtsPlaying(false);
      setTtsPaused(false);
      setActiveParagraphIndex(null);
      setActiveCharRange(null);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setTtsPlaying(true);
    setTtsPaused(false);
    setActiveParagraphIndex(0);
    setActiveCharRange([0, 1]);
  }, [article.content, article.pinyinContent, article.language, article.gradeLevel, ttsPlaying, ttsPaused, paragraphs]);

  const handleTTSStop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setTtsPlaying(false);
    setTtsPaused(false);
    setActiveParagraphIndex(null);
    setActiveCharRange(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      toggleTTS: handleTTS,
      stopTTS: handleTTSStop,
      isPlaying: ttsPlaying,
      isPaused: ttsPaused,
    }),
    [handleTTS, handleTTSStop, ttsPlaying, ttsPaused]
  );

  const isLowerGrade = article.gradeLevel <= 3;

  // Parse ruby-format pinyin into React elements with character highlighting
  const renderParagraph = (text: string, paragraphIndex: number) => {
    // For Chinese with pinyin, use existing ruby rendering
    if (article.language === "zh" && article.pinyinContent) {
      const parts: React.ReactNode[] = [];
      const regex = /([一-鿿])\(([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+)\)/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let key = 0;

      // Calculate clean text positions for character highlighting
      const cleanText = text.replace(/\([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+\)/g, (m, char, pinyin) => char);

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(
            <span key={key++} onClick={(e) => handleTextClick(e, text)}>
              {text.slice(lastIndex, match.index)}
            </span>
          );
        }

        // Check if this character is within the active char range
        const charPosition = match.index - text.slice(0, match.index).replace(/\([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+\)/g, (m) => m.slice(0, 1)).length;
        const isActive = activeParagraphIndex === paragraphIndex &&
                        activeCharRange &&
                        charPosition >= activeCharRange[0] &&
                        charPosition < activeCharRange[1];

        parts.push(
          <ruby key={key++} className="ruby-pinyin" onClick={(e) => handleTextClick(e, text)}>
            {isActive ? (
              <mark className="bg-amber-200 rounded px-0.5">{match[1]}</mark>
            ) : (
              match[1]
            )}
            <rt>{match[2]}</rt>
          </ruby>
        );
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) {
        parts.push(
          <span key={key++} onClick={(e) => handleTextClick(e, text)}>
            {text.slice(lastIndex)}
          </span>
        );
      }
      return parts.length > 0 ? parts : text;
    }

    // For English or Chinese without pinyin, render with word highlighting
    if (activeParagraphIndex === paragraphIndex && activeCharRange) {
      // Split text and highlight the active character range
      const before = text.slice(0, activeCharRange[0]);
      const active = text.slice(activeCharRange[0], activeCharRange[1]);
      const after = text.slice(activeCharRange[1]);
      return (
        <>
          <span onClick={(e) => handleTextClick(e, text)}>{before}</span>
          <mark className="bg-amber-200 rounded px-0.5" onClick={(e) => handleTextClick(e, text)}>{active}</mark>
          <span onClick={(e) => handleTextClick(e, text)}>{after}</span>
        </>
      );
    }
    return <span onClick={(e) => handleTextClick(e, text)}>{text}</span>;
  };

  return (
    <div className="flex flex-col">
      {/* Ruby text alignment fix */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .ruby-pinyin {
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            vertical-align: baseline;
            line-height: 1.2;
            margin: 0 0.02em;
          }
          .ruby-pinyin > *:first-child {
            order: 1;
            line-height: 1.4;
          }
          .ruby-pinyin > rt {
            order: 0;
            font-size: 0.45em;
            color: #9ca3af;
            line-height: 1.1;
            text-align: center;
            padding: 0 0.1em;
            margin-bottom: 0.15em;
            white-space: nowrap;
          }
        `
      }} />

      {/* Unified Header Bar */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-cream-200 -mx-4 px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Back + Title (truncated) */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.back()}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-cream-100"
            >
              ←
            </button>
            <span className="text-sm font-medium text-forest-700 truncate max-w-[180px]">
              {article.title}
            </span>
          </div>

          {/* Right: TTS + Quiz buttons */}
          <div className="flex items-center gap-2">
            {isLowerGrade && ttsSupported && (
              <button
                onClick={handleTTS}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cream-100 text-sm font-medium text-ink-700 hover:bg-cream-200 transition"
              >
                {ttsPlaying && !ttsPaused ? "⏸️" : "🔊"}
                <span>{ttsPlaying && !ttsPaused ? "暂停" : "朗读"}</span>
              </button>
            )}
            <button
              onClick={onStartQuiz}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-sm font-medium text-white hover:bg-primary-dark transition"
            >
              📝
              <span>答题</span>
            </button>
          </div>
        </div>

        {/* Progress bar below */}
        <div className="mt-2 h-1 bg-cream-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Dictionary Popup */}
      {dictLookup && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-elevation-floating border border-cream-200 p-3 min-w-[120px] cursor-pointer"
          style={{ left: Math.min(dictLookup.x, window.innerWidth - 150), top: dictLookup.y + 10 }}
          onClick={() => setDictLookup(null)}
        >
          <div className="text-2xl font-bold text-forest-800 mb-1">
            {dictLookup.word}
          </div>
          {article.language === "zh" && article.pinyinContent && (
            <div className="text-sm text-ink-500">
              {getPinyinForChar(dictLookup.word)}
            </div>
          )}
          <div className="text-xs text-ink-400 mt-2">点击关闭</div>
        </div>
      )}

      {/* Content area */}
      {isLandscape ? (
        <PageFlipContent
          paragraphs={paragraphs}
          renderParagraph={renderParagraph}
          illustrationMap={illustrationMap}
          activeParagraphIndex={activeParagraphIndex}
          activeCharRange={activeCharRange}
          isLowerGrade={isLowerGrade}
        />
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Cover image - smaller and inline */}
          {article.coverImageUrl && (
            <div className="mb-4">
              <img
                src={`${article.coverImageUrl}?width=400&format=webp&quality=70`}
                alt={article.title}
                className="h-32 w-full object-cover rounded-lg"
              />
            </div>
          )}

          {/* Title area */}
          <div className="space-y-3 mb-6">
            <h1 className="text-2xl font-bold text-forest-800">
              {article.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
              <span className="rounded-full bg-primary/10 px-3 py-0.5 font-medium text-primary">
                {article.category}
              </span>
              <span>G{article.gradeLevel}</span>
              <span>{article.wordCount} 词</span>
              <span>预计 {article.estimatedMinutes} 分钟</span>
            </div>
          </div>

          {/* Classical quote - minimal styling */}
          {article.classicalQuote && (
            <div className="mb-6 py-3 border-y border-cream-200">
              <p className="text-lg font-medium text-forest-800">
                {article.classicalQuote.original}
              </p>
              <p className="mt-1 text-sm text-ink-400">
                {article.classicalQuote.pinyin}
              </p>
            </div>
          )}

          {/* Content paragraphs - clean, focused */}
          <div
            className={`space-y-4 text-forest-700 ${
              isLowerGrade ? "text-lg leading-relaxed" : "text-base leading-relaxed"
            }`}
          >
            {paragraphs.map((paragraph, index) => (
              <div
                key={index}
                data-paragraph-index={index}
                className={`transition-colors duration-300 ${
                  activeParagraphIndex === index && activeCharRange
                    ? "bg-amber-50 rounded-lg px-2 -mx-2 py-1"
                    : ""
                }`}
              >
                <p>{renderParagraph(paragraph, index)}</p>

                {/* Collapsible illustration */}
                {illustrationMap.has(index) && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-600 flex items-center gap-1 list-none">
                      <span className="transform transition-transform group-open:rotate-90">▶</span>
                      查看配图
                    </summary>
                    <div className="mt-2 rounded-lg overflow-hidden">
                      <img
                        src={`${illustrationMap.get(index)!.image_url}?width=400&format=webp&quality=70`}
                        alt={
                          illustrationMap.get(index)!.scene_description ||
                          "段落插图"
                        }
                        className="w-full object-cover max-h-40"
                      />
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Page Flip Content Component
// ---------------------------------------------------------------------------

interface Illustration {
  paragraph_index: number;
  image_url: string;
  scene_description?: string;
}

interface PageFlipContentProps {
  paragraphs: string[];
  renderParagraph: (text: string, paragraphIndex: number) => React.ReactNode;
  illustrationMap: Map<number, Illustration>;
  activeParagraphIndex: number | null;
  activeCharRange: [number, number] | null;
  isLowerGrade: boolean;
}

function PageFlipContent({
  paragraphs,
  renderParagraph,
  illustrationMap,
  activeParagraphIndex,
  activeCharRange,
  isLowerGrade,
}: PageFlipContentProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<number[][]>([]);
  const [showNav, setShowNav] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Measure and paginate paragraphs
  useEffect(() => {
    if (!measureRef.current) return;

    const measureEl = measureRef.current;
    // Clear previous content
    measureEl.innerHTML = "";

    const pageHeight = measureEl.clientHeight;
    if (pageHeight <= 0) return;

    const newPages: number[][] = [];
    let currentPageIndices: number[] = [];
    let currentHeight = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      // Measure paragraph
      const pDiv = document.createElement("div");
      pDiv.className = isLowerGrade ? "text-lg leading-relaxed" : "text-base leading-relaxed";
      pDiv.style.width = "100%";
      const pEl = document.createElement("p");
      pEl.className = "py-1";
      pEl.textContent = paragraphs[i];
      pDiv.appendChild(pEl);

      // Measure illustration if present
      if (illustrationMap.has(i)) {
        const illDiv = document.createElement("div");
        illDiv.className = "mt-4 overflow-hidden rounded-xl";
        const img = document.createElement("img");
        img.src = `${illustrationMap.get(i)!.image_url}?width=400&format=webp&quality=70`;
        img.alt = illustrationMap.get(i)!.scene_description || "段落配图";
        img.className = "w-full object-cover";
        img.style.maxHeight = "120px";
        illDiv.appendChild(img);
        pDiv.appendChild(illDiv);
      }

      measureEl.appendChild(pDiv);
      const height = pDiv.offsetHeight;
      measureEl.removeChild(pDiv);

      // Check if adding this paragraph would overflow the page
      // Allow at least one paragraph per page even if it overflows
      if (currentPageIndices.length > 0 && currentHeight + height > pageHeight) {
        newPages.push(currentPageIndices);
        currentPageIndices = [i];
        currentHeight = height;
      } else {
        currentPageIndices.push(i);
        currentHeight += height;
      }
    }

    if (currentPageIndices.length > 0) {
      newPages.push(currentPageIndices);
    }

    setPages(newPages);
    setCurrentPage(0);
  }, [paragraphs, illustrationMap, isLowerGrade]);

  // Navigation handlers
  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, pages.length - 1));
  }, [pages.length]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  // Auto-hide nav after 2s of inactivity
  const showNavTemporarily = useCallback(() => {
    setShowNav(true);
    if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    navTimeoutRef.current = setTimeout(() => setShowNav(false), 2000);
  }, []);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 50) {
      if (dx > 0) goNext();
      else goPrev();
    }
    touchStartRef.current = null;
  };

  // Click zone handlers
  const handleClick = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const width = rect.width;
    if (x < width * 0.25) goPrev();
    else if (x > width * 0.75) goNext();
  };

  // Cleanup nav timeout on unmount
  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-10rem)] overflow-hidden"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseMove={showNavTemporarily}
    >
      {/* Hidden measurement container */}
      <div
        ref={measureRef}
        style={{
          position: "fixed",
          visibility: "hidden",
          pointerEvents: "none",
          zIndex: -1,
          width: "calc(100% - 8rem)",
          maxWidth: "calc(48rem - 4rem)",
          height: "calc(100vh - 14rem)",
          padding: "2rem",
          fontSize: "1rem",
          lineHeight: "1.75",
          overflow: "hidden",
        }}
      />

      {/* Pages */}
      <div
        className="flex h-full"
        style={{
          transform: `translateX(calc(-${currentPage} * 100%))`,
          transition: "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        {pages.map((pageIndices, pageIdx) => (
          <div
            key={pageIdx}
            className="flex-shrink-0 w-full h-full px-4 flex items-center justify-center"
          >
            <div
              className="w-full h-full max-w-3xl rounded-lg overflow-hidden shadow-lg"
              style={{
                backgroundColor: "var(--reader-surface)",
                color: "var(--reader-text)",
              }}
            >
              <div className="h-full overflow-hidden p-6">
                <div
                  className={`space-y-3 ${
                    isLowerGrade ? "text-lg leading-relaxed" : "text-base leading-relaxed"
                  }`}
                >
                  {pageIndices.map((idx) => (
                    <div
                      key={idx}
                      data-paragraph-index={idx}
                      className={`transition-colors duration-300 ${
                        activeParagraphIndex === idx && activeCharRange
                          ? "bg-amber-50 rounded-lg px-2 -mx-2 py-1"
                          : ""
                      }`}
                    >
                      <p>{renderParagraph(paragraphs[idx], idx)}</p>
                      {illustrationMap.has(idx) && (
                        <details className="mt-2 group">
                          <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-600 list-none flex items-center gap-1">
                            <span className="transform transition-transform group-open:rotate-90">▶</span>
                            查看配图
                          </summary>
                          <img
                            src={`${illustrationMap.get(idx)!.image_url}?width=400&format=webp&quality=70`}
                            alt={illustrationMap.get(idx)!.scene_description || "段落配图"}
                            className="mt-2 w-full object-cover rounded-lg"
                            style={{ maxHeight: "120px" }}
                          />
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation overlay */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          showNav ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Left arrow */}
        {currentPage > 0 && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <span className="text-3xl opacity-50">◀</span>
          </div>
        )}
        {/* Right arrow */}
        {currentPage < pages.length - 1 && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <span className="text-3xl opacity-50">▶</span>
          </div>
        )}
        {/* Page indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
          <span className="text-sm opacity-70">
            {currentPage + 1} / {pages.length}
          </span>
          <div className="flex gap-1">
            {pages.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i === currentPage ? "bg-primary" : "bg-ink-300"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}