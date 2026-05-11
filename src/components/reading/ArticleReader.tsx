"use client";

import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { createClient } from "@/lib/supabase/client";
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
  assignmentId?: string | null;
}

export interface ArticleReaderRef {
  toggleTTS: () => void;
  stopTTS: () => void;
  isPlaying: boolean;
  isPaused: boolean;
}

export const ArticleReader = forwardRef<ArticleReaderRef, ArticleReaderProps>(function ArticleReader(
  { article, onStartQuiz, assignmentId },
  ref
) {
  const router = useRouter();
  const supabase = createClient();
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
  const [orientationLocked, setOrientationLocked] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Recording state
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'stopped'>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [showRecordingMenu, setShowRecordingMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recordingSubmitted, setRecordingSubmitted] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Landscape detection
  useEffect(() => {
    const check = () => {
      setIsLandscape(window.innerWidth >= 1024 && window.innerWidth > window.innerHeight);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Orientation lock
  const toggleOrientationLock = useCallback(async () => {
    if (orientationLocked) {
      if (screen.orientation?.unlock) {
        screen.orientation.unlock();
      }
      setOrientationLocked(false);
    } else {
      if (screen.orientation?.lock) {
        try {
          await screen.orientation.lock('landscape');
          setOrientationLocked(true);
        } catch {
          // Lock failed, silently ignore
        }
      }
    }
  }, [orientationLocked]);

  // Recording control functions
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordingBlob(blob);
        setRecordingUrl(url);
        setRecordingState('stopped');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecordingState('recording');
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('录音失败:', error);
      alert('无法访问麦克风，请检查权限设置');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setRecordingState('paused');
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setRecordingState('recording');
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    }
    setRecordingState('stopped');
  };

  const resetRecording = () => {
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
    }
    setRecordingBlob(null);
    setRecordingUrl(null);
    setRecordingDuration(0);
    setRecordingState('idle');
  };

  const uploadRecording = async (): Promise<{ success: boolean; checkInId?: string; error?: string }> => {
    if (!recordingBlob) {
      return { success: false, error: '没有录音文件' };
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // 1. Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: '未登录' };
      }

      // 2. Generate file path
      const timestamp = Date.now();
      const fileName = `reading_${article.id}_${timestamp}.webm`;
      const filePath = `${session.user.id}/${fileName}`;

      // 3. Upload recording to Storage
      setUploadProgress(30);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, recordingBlob, {
          contentType: 'audio/webm',
          upsert: false,
        });

      if (uploadError) {
        console.error('上传失败:', uploadError);
        return { success: false, error: '上传失败' };
      }

      setUploadProgress(60);

      // 4. Create check_in record
      const { data: checkInData, error: checkInError } = await supabase
        .from('check_ins')
        .insert({
          child_id: session.user.id,
          assignment_id: assignmentId || null,
          type: 'reading',
          completed_at: new Date().toISOString(),
          points_earned: 10,
        })
        .select()
        .single();

      if (checkInError) {
        console.error('创建打卡记录失败:', checkInError);
        return { success: false, error: '创建打卡记录失败' };
      }

      setUploadProgress(80);

      // 5. Create attachment record
      const { error: attachmentError } = await supabase
        .from('attachments')
        .insert({
          check_in_id: checkInData.id,
          type: 'audio',
          storage_path: filePath,
          file_name: fileName,
          mime_type: 'audio/webm',
        });

      if (attachmentError) {
        console.error('创建附件记录失败:', attachmentError);
      }

      setUploadProgress(100);

      // 6. Trigger points update event
      window.dispatchEvent(new CustomEvent('child-points-changed'));

      return { success: true, checkInId: checkInData.id };
    } catch (error) {
      console.error('上传异常:', error);
      return { success: false, error: '上传异常' };
    } finally {
      setUploading(false);
    }
  };

  // Recording cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
    };
  }, [recordingUrl]);

  // Detect current lock state on mount
  useEffect(() => {
    const checkLock = () => {
      if (screen.orientation?.type?.includes('landscape')) {
        setOrientationLocked(true);
      }
    };
    checkLock();
    screen.orientation?.addEventListener('change', checkLock);
    return () => screen.orientation?.removeEventListener('change', checkLock);
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

  // Page navigation for landscape mode
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = useMemo(() => Math.ceil(paragraphs.length / 2), [paragraphs.length]);
  const totalPages = useMemo(() => Math.ceil(paragraphs.length / pageSize), [paragraphs.length, pageSize]);

  // Split paragraphs into pages (2 paragraphs per "page view" in landscape)
  const pages = useMemo(() => {
    const result: number[][] = [];
    for (let i = 0; i < paragraphs.length; i += pageSize) {
      result.push(paragraphs.slice(i, i + pageSize).map((_, idx) => i + idx));
    }
    return result;
  }, [paragraphs, pageSize]);

  const goNext = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  const handlePageClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (x < width * 0.25) {
      goPrev();
    } else if (x > width * 0.75) {
      goNext();
    }
  }, [goNext, goPrev]);

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

      {/* Top bar - h-12, 48px */}
      <div
        className="sticky top-0 z-20 h-12 backdrop-blur-md flex items-center justify-between px-4 border-b"
        style={{
          backgroundColor: "var(--reader-surface)",
          borderColor: "var(--reader-border)",
        }}
      >
        {/* Left: Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm"
          style={{ color: "var(--reader-text-muted)" }}
        >
          ← 返回
        </button>

        {/* Center: Title */}
        <h1
          className="text-sm font-medium truncate max-w-[40%] mx-4"
          style={{ color: "var(--reader-text)" }}
        >
          {article.title}
        </h1>

        {/* Right: Difficulty label + Orientation lock + Recording status */}
        <div className="flex items-center gap-2">
          {/* Recording submitted status */}
          {recordingSubmitted && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              ✅ 已打卡
            </span>
          )}
          {/* Recording status */}
          {recordingState !== 'idle' && (
            <div className="flex items-center gap-2">
              {recordingState === 'recording' && (
                <span className="flex items-center gap-1 text-sm text-red-500">
                  <span className="animate-pulse">●</span>
                  <span>{formatDuration(recordingDuration)}</span>
                </span>
              )}
              {recordingState === 'paused' && (
                <span className="text-sm" style={{ color: "var(--reader-text-muted)" }}>
                  ⏸ {formatDuration(recordingDuration)}
                </span>
              )}
              {recordingState === 'stopped' && (
                <span className="text-sm text-green-600">
                  ✅ {formatDuration(recordingDuration)}
                </span>
              )}
            </div>
          )}
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary"
          >
            G{article.gradeLevel}
          </span>
          <button
            onClick={toggleOrientationLock}
            className="text-lg"
            style={{
              color: orientationLocked
                ? "var(--reader-accent)"
                : "var(--reader-text-muted)",
            }}
            aria-label={orientationLocked ? "解锁屏幕方向" : "锁定屏幕方向"}
          >
            {orientationLocked ? "🔒" : "🔓"}
          </button>
        </div>
      </div>

      {/* Progress bar - thin */}
      <div style={{ backgroundColor: "var(--reader-border)" }} className="h-0.5">
        <div
          className="h-full transition-all"
          style={{
            width: `${progress}%`,
            backgroundColor: "var(--reader-accent)"
          }}
        />
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
        <div
          className="flex h-full w-full items-center"
          onClick={handlePageClick}
        >
          {/* Left page - 50% width, no margin interference */}
          <div
            className="h-full flex items-center justify-center"
            style={{ width: "50%" }}
          >
            <div
              className="w-full h-full flex items-center px-8"
              style={{ color: "var(--reader-text)" }}
            >
              <div className="w-full space-y-4 text-xl leading-relaxed">
                {pages.length > 0 && pages[currentPage] && pages[currentPage].map((paragraphIndex) => (
                  <div key={paragraphIndex}>
                    <p>{renderParagraph(paragraphs[paragraphIndex], paragraphIndex)}</p>
                    {illustrationMap.has(paragraphIndex) && (
                      <figure className="mt-2 rounded-lg overflow-hidden">
                        <img
                          src={`${illustrationMap.get(paragraphIndex)!.image_url}?width=600`}
                          alt={illustrationMap.get(paragraphIndex)!.scene_description || "段落配图"}
                          className="w-full max-h-40 object-cover"
                        />
                      </figure>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Middle divider line */}
          <div className="w-px h-full" style={{ backgroundColor: "var(--reader-border)" }} />

          {/* Right page - 50% width */}
          <div
            className="h-full flex items-center justify-center"
            style={{ width: "50%" }}
          >
            <div
              className="w-full h-full flex items-center px-8"
              style={{ color: "var(--reader-text)" }}
            >
              <div className="w-full space-y-4 text-xl leading-relaxed">
                {pages.length > 0 && pages[currentPage + 1] ? (
                  pages[currentPage + 1].map((paragraphIndex) => (
                    <div key={paragraphIndex}>
                      <p>{renderParagraph(paragraphs[paragraphIndex], paragraphIndex)}</p>
                      {illustrationMap.has(paragraphIndex) && (
                        <figure className="mt-2 rounded-lg overflow-hidden">
                          <img
                            src={`${illustrationMap.get(paragraphIndex)!.image_url}?width=600`}
                            alt={illustrationMap.get(paragraphIndex)!.scene_description || "段落配图"}
                            className="w-full max-h-40 object-cover"
                          />
                        </figure>
                      )}
                    </div>
                  ))
                ) : pages.length > 0 && pages[currentPage] ? (
                  pages[currentPage].map((paragraphIndex) => (
                    <div key={paragraphIndex}>
                      <p>{renderParagraph(paragraphs[paragraphIndex], paragraphIndex)}</p>
                      {illustrationMap.has(paragraphIndex) && (
                        <figure className="mt-2 rounded-lg overflow-hidden">
                          <img
                            src={`${illustrationMap.get(paragraphIndex)!.image_url}?width=600`}
                            alt={illustrationMap.get(paragraphIndex)!.scene_description || "段落配图"}
                            className="w-full max-h-40 object-cover"
                          />
                        </figure>
                      )}
                    </div>
                  ))
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Portrait single page scroll mode */
        <div className="max-w-2xl mx-auto px-4 py-6 pb-20 overflow-y-auto">
          <div className="mb-6">
            <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium mr-2 ${
              article.language === "en" ? "bg-sky-100 text-sky-700" : "bg-coral-100 text-coral-700"
            }`}>
              {article.language === "en" ? "English" : "中文"}
            </span>
            <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
              {article.category}
            </span>
            <h1 className="text-2xl font-bold mt-3" style={{ color: "var(--reader-text)" }}>
              {article.title}
            </h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-ink-500">
              <span>G{article.gradeLevel}</span>
              <span>{article.wordCount} words</span>
              <span>{article.estimatedMinutes} min</span>
            </div>
          </div>
          <div className="space-y-4 text-lg leading-relaxed" style={{ color: "var(--reader-text)" }}>
            {paragraphs.map((paragraph, index) => (
              <div key={index}>
                <p>{renderParagraph(paragraph, index)}</p>
                {illustrationMap.has(index) && (
                  <figure className="mt-4 rounded-xl overflow-hidden">
                    <img
                      src={`${illustrationMap.get(index)!.image_url}?width=600`}
                      alt={illustrationMap.get(index)!.scene_description || "段落配图"}
                      className="w-full max-h-48 object-cover cursor-pointer"
                    />
                  </figure>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom simplified toolbar */}
      <div
        className="fixed bottom-0 left-0 right-0 h-14 flex items-center justify-center px-4 border-t z-20"
        style={{
          backgroundColor: "var(--reader-surface)",
          borderColor: "var(--reader-border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-6">
          {/* Recording button - largest and most prominent */}
          <button
            onClick={() => {
              if (recordingState === 'idle') {
                void startRecording();
              } else if (recordingState === 'recording') {
                pauseRecording();
              } else if (recordingState === 'paused') {
                resumeRecording();
              } else if (recordingState === 'stopped') {
                setShowRecordingMenu(true);
              }
            }}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-medium transition-all ${
              recordingState === 'recording'
                ? 'bg-red-500 text-white shadow-lg'
                : recordingState === 'stopped'
                ? 'bg-green-500 text-white shadow-lg'
                : 'bg-forest-500 text-white shadow-lg hover:bg-forest-600'
            }`}
          >
            {recordingState === 'recording' ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
              </svg>
            )}
            <span>
              {recordingState === 'idle' ? '录音打卡' :
               recordingState === 'recording' ? '暂停' :
               recordingState === 'paused' ? '继续' :
               '已停止'}
            </span>
          </button>

          {/* Read aloud button */}
          <button
            onClick={handleTTS}
            className="flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-medium bg-forest-100 text-forest-700 hover:bg-forest-200 transition-all shadow"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            <span>朗读</span>
          </button>

          {/* Quiz button */}
          <button
            onClick={onStartQuiz}
            className="flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-medium text-white bg-primary hover:bg-primary-dark transition-all shadow"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <span>答题</span>
          </button>

          {/* More button (favorite + settings + font) */}
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="p-3 rounded-full hover:bg-gray-100 transition-all"
            style={{ color: "var(--reader-text-muted)" }}
            aria-label="更多"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
        </div>
      </div>

      {/* More menu */}
      {showMoreMenu && (
        <div
          className="fixed bottom-16 right-4 bg-white rounded-2xl shadow-xl p-2 z-30 min-w-[160px]"
          onClick={() => setShowMoreMenu(false)}
        >
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 text-sm text-forest-700">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <span>收藏</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 text-sm text-forest-700">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 7 4 4 20 4 20 7"/>
              <line x1="9" y1="20" x2="15" y2="20"/>
              <line x1="12" y1="4" x2="12" y2="20"/>
            </svg>
            <span>字体大小</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 text-sm text-forest-700">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33"/>
            </svg>
            <span>主题设置</span>
          </button>
        </div>
      )}

      {/* Recording menu modal */}
      {showRecordingMenu && recordingUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowRecordingMenu(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-80 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">录音操作</h3>

            {/* Recording duration */}
            <div className="text-center mb-4">
              <span className="text-3xl font-bold text-forest-700">
                {formatDuration(recordingDuration)}
              </span>
            </div>

            {/* Audio playback */}
            <audio src={recordingUrl} controls className="w-full mb-4" />

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setShowRecordingMenu(false);

                  const result = await uploadRecording();

                  if (result.success) {
                    setRecordingSubmitted(true);
                    alert('打卡成功！获得 10 积分 🎉');
                    setTimeout(() => {
                      void resetRecording();
                    }, 2000);
                  } else {
                    alert(result.error || '打卡失败，请重试');
                  }
                }}
                disabled={uploading}
                className="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>上传中 {uploadProgress}%</span>
                  </>
                ) : (
                  <>
                    📤 提交打卡
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowRecordingMenu(false);
                  void resetRecording();
                }}
                className="w-full py-3 rounded-xl bg-coral-100 text-coral-700 font-medium"
              >
                🔄 重新录音
              </button>
              <button
                onClick={() => setShowRecordingMenu(false)}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});