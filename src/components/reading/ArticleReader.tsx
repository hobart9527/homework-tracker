"use client";

import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useReaderTheme, resolveTheme, type FontSize } from "./ReaderThemeContext";
import { GestureOverlay } from "./GestureOverlay";

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
  const { theme: readerThemeContext, setTheme, fontSize: fontSizeContext, setFontSize, lineHeight, setLineHeight } = useReaderTheme();
  const resolvedTheme = resolveTheme(readerThemeContext);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [ttsRate, setTtsRate] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('hw-tts-rate');
        if (saved !== null) return parseFloat(saved);
      } catch {}
    }
    return 1.0;
  });
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

  // Persist TTS rate changes and restart if playing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('hw-tts-rate', String(ttsRate));
      } catch {}
    }
    // If TTS is currently playing (not paused), restart with new rate
    if (ttsPlaying && !ttsPaused && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const timer = setTimeout(() => {
        handleTTS();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [ttsRate]);

  // Map context font size to pixel values
  const fontSizePx = useMemo(() => {
    const map: Record<FontSize, number> = { small: 18, medium: 20, large: 22, xlarge: 26 };
    return map[fontSizeContext];
  }, [fontSizeContext]);

  // Map context line height to CSS values
  const lineHeightValue = useMemo(() => {
    const map: Record<import("./ReaderThemeContext").LineHeight, string> = { compact: '1.7', standard: '2.0', loose: '2.3' };
    return map[lineHeight];
  }, [lineHeight]);

  // Recording control functions
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      // Check for secure context (HTTPS or localhost)
      if (!window.isSecureContext) {
        alert('录音功能需要在安全的网络环境下使用（请使用 HTTPS 或 localhost）');
        return;
      }

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
    } catch (error: unknown) {
      console.error('录音失败:', error);
      const err = error as Error & { name?: string };
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风。\n设置路径：浏览器设置 → 隐私与安全 → 麦克风');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        alert('未找到麦克风设备，请连接麦克风后重试。');
      } else {
        alert('无法访问麦克风，请检查权限设置或刷新页面重试。');
      }
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
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
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
    let rawParagraphs: string[] = [];

    if (article.language === "zh") {
      const lines = displayContent.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
      for (const line of lines) {
        // Split by Chinese sentence delimiters only
        const sentences = line.split(/(?<=[。！？；])\s*/);
        let current = '';
        for (const s of sentences) {
          if (!s.trim()) continue;
          // ~150 char chunks = roughly 3-4 visual lines at default font
          if (current.length + s.length > 250 && current.length > 0) {
            rawParagraphs.push(current.trim());
            current = s;
          } else {
            current += s;
          }
        }
        if (current.trim()) rawParagraphs.push(current.trim());
      }
    } else if (article.language === "en") {
      const lines = displayContent.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
      for (const line of lines) {
        // Split by sentence punctuation
        const sentences = line.split(/(?<=[.!?])\s+/);
        let current = '';
        for (const s of sentences) {
          const clean = s.trim();
          if (!clean) continue;
          // ~200 char chunks = roughly 3-4 visual lines
          if (current.length + clean.length > 200 && current.length > 0) {
            rawParagraphs.push(current.trim());
            current = clean;
          } else {
            current += (current ? ' ' : '') + clean;
          }
        }
        if (current.trim()) rawParagraphs.push(current.trim());
      }
    } else {
      rawParagraphs = displayContent.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
    }

    return rawParagraphs.filter(p => p.length > 5);
  }, [displayContent, article.language]);

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

// Page navigation - single page pagination
  const [currentPage, setCurrentPage] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // --- Measurement-based pagination ---
  const [paragraphHeights, setParagraphHeights] = useState<number[]>([]);
  const [measured, setMeasured] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentContainerHeight, setContentContainerHeight] = useState<number>(0);

  // Measure actual paragraph heights once after render
  useEffect(() => {
    if (!measureRef.current || paragraphs.length === 0) return;

    const blocks = measureRef.current.querySelectorAll('[data-measure-block]');
    if (blocks.length !== paragraphs.length) return;

    const heights: number[] = [];
    blocks.forEach((el) => {
      heights.push(el.getBoundingClientRect().height);
    });

    setParagraphHeights(heights);
    setMeasured(true);
  }, [paragraphs, fontSizePx, lineHeightValue, displayContent]);

  // Measure actual content container height for pagination
  useEffect(() => {
    const measureContainer = () => {
      if (containerRef.current) {
        const h = containerRef.current.getBoundingClientRect().height;
        setContentContainerHeight(h);
      }
    };
    measureContainer();
    window.addEventListener('resize', measureContainer);
    return () => window.removeEventListener('resize', measureContainer);
  }, [measured]);

  const pageBreaks = useMemo(() => {
    if (!measured || paragraphHeights.length === 0) return [0];

    const innerPadding = 48;
    const availableHeight = contentContainerHeight > 0
      ? contentContainerHeight - innerPadding
      : 600;
    const titleOverhead = 100;
    const firstPageAvailableHeight = availableHeight - titleOverhead;

    const breaks: number[] = [0];
    let currentPageHeight = 0;
    let isFirstPage = true;

    for (let i = 0; i < paragraphHeights.length; i++) {
      const paraHeight = paragraphHeights[i];
      const gap = currentPageHeight > 0 ? 6 : 0;
      const pageCapacity = isFirstPage ? firstPageAvailableHeight : availableHeight;

      if (currentPageHeight + gap + paraHeight > pageCapacity && currentPageHeight > 0) {
        breaks.push(i);
        currentPageHeight = paraHeight;
        isFirstPage = false;
      } else {
        currentPageHeight += gap + paraHeight;
      }
    }

    return breaks;
  }, [measured, paragraphHeights, contentContainerHeight]);

  const totalPages = pageBreaks.length;

  // Guard: clamp currentPage if pageBreaks shrinks
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, currentPage]);

  const hasReadAll = currentPage >= totalPages - 1;

  const goToPage = useCallback((page: number) => {
    if (page < 0 || page >= totalPages) return;
    // Stop TTS when changing pages
    if (window.speechSynthesis && ttsPlaying) {
      window.speechSynthesis.cancel();
      setTtsPlaying(false);
      setTtsPaused(false);
      setActiveCharRange(null);
      setActiveParagraphIndex(null);
    }
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentPage(page);
      setIsTransitioning(false);
    }, 150);
  }, [totalPages, ttsPlaying]);

  // Page paragraphs for current page
  const pageParagraphs = useMemo(() => {
    const start = pageBreaks[currentPage];
    const end = currentPage + 1 < pageBreaks.length ? pageBreaks[currentPage + 1] : paragraphs.length;
    return paragraphs.slice(start, end).map((p, i) => ({ text: p, globalIndex: start + i }));
  }, [currentPage, pageBreaks, paragraphs]);

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

  // Helper function to get pinyin for a character from pinyinContent
  const getPinyinForChar = useCallback((char: string): string => {
    if (!article.pinyinContent) return "";
    const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escapedChar}\\(([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\\s]+)\\)`, 'g');
    const match = regex.exec(article.pinyinContent);
    return match ? match[1] : "";
  }, [article.pinyinContent]);

  // Handle text click for dictionary lookup
  const handleTextClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Use caretPositionFromPoint (standard) or caretRangeFromPoint (WebKit) to get clicked word
    let clickedText = '';
    
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos && pos.offsetNode && pos.offsetNode.nodeType === Node.TEXT_NODE) {
        const textNode = pos.offsetNode as Text;
        const offset = pos.offset;
        const text = textNode.textContent || '';
        // Get the word/character at this position
        const before = text.slice(0, offset);
        const after = text.slice(offset);
        const beforeWord = before.match(/[\u4e00-\u9fa5a-zA-Z]+$/)?.[0] || '';
        const afterWord = after.match(/^[\u4e00-\u9fa5a-zA-Z]+/)?.[0] || '';
        clickedText = beforeWord + afterWord;
      }
    } else if ((document as any).caretRangeFromPoint) {
      const range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
      if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer as Text;
        const offset = range.startOffset;
        const text = textNode.textContent || '';
        const before = text.slice(0, offset);
        const after = text.slice(offset);
        const beforeWord = before.match(/[\u4e00-\u9fa5a-zA-Z]+$/)?.[0] || '';
        const afterWord = after.match(/^[\u4e00-\u9fa5a-zA-Z]+/)?.[0] || '';
        clickedText = beforeWord + afterWord;
      }
    }
    
    if (!clickedText) return;

    // For Chinese, get single character; for English, get the word
    let word: string;
    if (/[\u4e00-\u9fa5]/.test(clickedText)) {
      word = clickedText.match(/[\u4e00-\u9fa5]/)?.[0] || clickedText[0];
    } else {
      word = clickedText.split(/\s+/)[0] || clickedText;
    }

    if (word) {
      setDictLookup({
        word,
        x: e.clientX,
        y: e.clientY,
      });
    }
  }, []);

  const handleTTS = useCallback(() => {
    if (!window.speechSynthesis) return;

    // If playing, toggle pause/resume
    if (ttsPlaying) {
      if (!ttsPaused) {
        window.speechSynthesis.pause();
        // Record pause time for highlight tracking
        const u = utteranceRef.current as any;
        if (u?._recordPause) u._recordPause();
        setTtsPaused(true);
      } else {
        window.speechSynthesis.resume();
        // Record resume time for highlight tracking
        const u = utteranceRef.current as any;
        if (u?._recordResume) u._recordResume();
        setTtsPaused(false);
      }
      return;
    }

    // Start new playback
    window.speechSynthesis.cancel();

    // Build clean text (no pinyin markers) for each paragraph
    const cleanParagraphs: string[] = [];
    if (article.language === "zh" && article.pinyinContent) {
      for (const p of paragraphs) {
        cleanParagraphs.push(p.replace(/\([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+\)/g, ''));
      }
    } else {
      cleanParagraphs.push(...paragraphs);
    }

    // Join with single space for TTS (consistent with cleanContent)
    const cleanContent = cleanParagraphs.join(' ');
    const totalChars = cleanContent.length;

    // Build paragraph offset map for cleanContent
    const paraOffsets: { start: number; end: number }[] = [];
    let offset = 0;
    for (let p = 0; p < cleanParagraphs.length; p++) {
      const paraLen = cleanParagraphs[p].length;
      paraOffsets.push({ start: offset, end: offset + paraLen });
      offset += paraLen + 1; // +1 for space separator
    }

    // Pre-split content into words for English tracking
    const words: { text: string; start: number; end: number }[] = [];
    let charIndex = 0;
    cleanContent.split(/(\s+)/).forEach(segment => {
      if (segment.trim()) {
        words.push({ text: segment.trim(), start: charIndex, end: charIndex + segment.length });
      }
      charIndex += segment.length;
    });

    // Calculate estimated duration based on character count and rate
    // Chinese needs faster estimation to match actual TTS
    const charsPerSecond = article.language === "zh" ? 4.5 * ttsRate : 15 * ttsRate;
    const estimatedDurationMs = Math.max(2000, (totalChars / charsPerSecond) * 1000);

    // Time-based tracking for Chinese (more reliable than onboundary)
    let startTime = 0;
    let pausedAt = 0;
    let totalPausedMs = 0;
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    // Use ref for startTime so polling intervals see the actual value
    const startTimeRef = { current: 0 };

    const updateHighlight = () => {
      // Don't update highlight if TTS is paused
      if (ttsPaused || !window.speechSynthesis || window.speechSynthesis.paused) {
        return;
      }
      // Subtract pause time from elapsed
      const elapsed = Date.now() - startTime - totalPausedMs;
      const progress = Math.min(elapsed / estimatedDurationMs, 1);
      const currentCharIndex = Math.floor(progress * totalChars);

      // Find which paragraph this charIndex belongs to
      for (let p = 0; p < paraOffsets.length; p++) {
        const { start, end } = paraOffsets[p];
        if (currentCharIndex >= start && currentCharIndex < end) {
          setActiveParagraphIndex(p);
          const charInPara = currentCharIndex - start;
          // For Chinese, highlight current character; for English, highlight current word
          if (article.language === "zh") {
            setActiveCharRange([charInPara, charInPara + 1]);
          } else {
            for (let i = 0; i < words.length; i++) {
              if (currentCharIndex >= words[i].start && currentCharIndex < words[i].end) {
                setActiveCharRange([words[i].start - start, words[i].end - start]);
                break;
              }
            }
          }
          return;
        }
      }
    };

    const utterance = new SpeechSynthesisUtterance(cleanContent);
    utterance.lang = article.language === "zh" ? "zh-CN" : "en-US";
    utterance.rate = ttsRate;

    utterance.onstart = () => {
      startTime = Date.now();
      startTimeRef.current = startTime;
      totalPausedMs = 0;
      const intervalMs = 100; // Faster updates for smoother cursor
      progressInterval = setInterval(updateHighlight, intervalMs);
    };

    // Expose pause tracking for handleTTS pause/resume
    (utterance as any)._getPauseInfo = () => ({ pausedAt, totalPausedMs });
    (utterance as any)._recordPause = () => { pausedAt = Date.now(); };
    (utterance as any)._recordResume = () => { totalPausedMs += Date.now() - pausedAt; };

    utterance.onboundary = (event) => {
      // Use onboundary for word-level highlight when available
      if (article.language !== "zh") {
        for (let p = 0; p < paraOffsets.length; p++) {
          const { start, end } = paraOffsets[p];
          if (event.charIndex >= start && event.charIndex < end) {
            setActiveParagraphIndex(p);
            for (let i = 0; i < words.length; i++) {
              if (event.charIndex >= words[i].start && event.charIndex < words[i].end) {
                setActiveCharRange([words[i].start - start, words[i].end - start]);
                break;
              }
            }
            return;
          }
        }
      }
    };

    // Time-based polling for English (onboundary can be unreliable)
    if (article.language !== "zh") {
      const englishPollInterval = setInterval(() => {
        if (!window.speechSynthesis?.speaking || window.speechSynthesis?.paused) return;
        const elapsed = Date.now() - startTimeRef.current - ((utterance as any)._getPauseInfo?.()?.totalPausedMs || 0);
        const progress = Math.min(elapsed / estimatedDurationMs, 1);
        const currentCharIndex = Math.floor(progress * totalChars);

        for (let p = 0; p < paraOffsets.length; p++) {
          const { start, end } = paraOffsets[p];
          if (currentCharIndex >= start && currentCharIndex < end) {
            setActiveParagraphIndex(p);
            for (let i = 0; i < words.length; i++) {
              if (currentCharIndex >= words[i].start && currentCharIndex < words[i].end) {
                setActiveCharRange([words[i].start - start, words[i].end - start]);
                return;
              }
            }
            return;
          }
        }
      }, 150);
      (utterance as any)._englishPollInterval = englishPollInterval;
    }

    const cleanup = () => {
      if (progressInterval) clearInterval(progressInterval);
      if ((utterance as any)._englishPollInterval) clearInterval((utterance as any)._englishPollInterval);
      setActiveCharRange(null);
      setActiveParagraphIndex(null);
    };

    utterance.onend = () => {
      cleanup();
      setTtsPlaying(false);
      setTtsPaused(false);
    };
    utterance.onerror = () => {
      cleanup();
      setTtsPlaying(false);
      setTtsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setTtsPlaying(true);
    setTtsPaused(false);
  }, [article, ttsPlaying, ttsPaused, ttsRate, paragraphs]);

  const handleTTSStop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setTtsPlaying(false);
    setTtsPaused(false);
    setActiveCharRange(null);
    setActiveParagraphIndex(null);
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
      // Match one or more Chinese characters followed by pinyin in parentheses
      const regex = /([一-鿿]+)\(([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+)\)/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let key = 0;
      // Track position in clean text (without pinyin markers)
      let cleanPos = 0;

      while ((match = regex.exec(text)) !== null) {
        // Text before this match (non-Chinese characters)
        if (match.index > lastIndex) {
          const nonChinese = text.slice(lastIndex, match.index);
          cleanPos += nonChinese.length;
          parts.push(
            <span key={key++} onClick={handleTextClick}>
              {nonChinese}
            </span>
          );
        }

        const chars = match[1];
        const pinyinStr = match[2];
        // Split pinyin by spaces; if no spaces, split into individual pinyin
        const pinyins = pinyinStr.includes(' ') 
          ? pinyinStr.split(/\s+/).filter(Boolean)
          : chars.length === 1 
            ? [pinyinStr]
            : pinyinStr.match(/[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+/g) || [pinyinStr];

        // Render each character with its pinyin
        for (let i = 0; i < chars.length; i++) {
          const char = chars[i];
          const py = pinyins[i] || '';
          // Check against clean text position
          const isActive = activeParagraphIndex === paragraphIndex &&
                          activeCharRange &&
                          cleanPos + i >= activeCharRange[0] &&
                          cleanPos + i < activeCharRange[1];

          parts.push(
            <ruby key={key++} className="ruby-pinyin" onClick={handleTextClick}>
              {isActive ? (
                <mark className="bg-amber-200/70 rounded-sm" style={{ boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.5)' }}>{char}</mark>
              ) : (
                char
              )}
              <rp>(</rp><rt>{py}</rt><rp>)</rp>
            </ruby>
          );
        }
        // Advance clean position by number of Chinese characters
        cleanPos += chars.length;
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) {
        const remaining = text.slice(lastIndex);
        parts.push(
          <span key={key++} onClick={handleTextClick}>
            {remaining}
          </span>
        );
      }
      return parts.length > 0 ? parts : <>{text}</>;
    }

    // For English or Chinese without pinyin, render with word highlighting
    if (activeParagraphIndex === paragraphIndex && activeCharRange) {
      const paraText = text;
      const wordStart = activeCharRange[0];
      const wordEnd = activeCharRange[1];

      if (wordStart >= 0 && wordEnd <= paraText.length && wordStart < wordEnd) {
        return (
          <>
            <span onClick={handleTextClick}>{paraText.slice(0, wordStart)}</span>
            <mark className="bg-amber-200/70 rounded-sm" style={{ boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.5)' }} onClick={handleTextClick}>
              {paraText.slice(wordStart, wordEnd)}
            </mark>
            <span onClick={handleTextClick}>{paraText.slice(wordEnd)}</span>
          </>
        );
      }
    }
    return <span onClick={handleTextClick}>{text}</span>;
  };

  return (
    <div className="flex flex-col">
      {/* Ruby text alignment fix */}
      <style dangerouslySetInnerHTML={{
        __html: `
          ruby {
            ruby-position: over;
            ruby-align: center;
            margin-right: 0.12em;
          }
          ruby:last-child {
            margin-right: 0;
          }
          rt {
            font-size: 0.55em;
            color: var(--reader-text-muted);
            text-align: center;
            white-space: nowrap;
            letter-spacing: 0;
            line-height: 1.3;
            font-family: 'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', system-ui, sans-serif;
            margin-bottom: 0.05em;
          }
          .ruby-pinyin {
            ruby-position: over;
          }
          .ruby-pinyin rt {
            font-size: 0.55em;
            color: var(--reader-text-muted);
          }
          .page-transition {
            opacity: 0;
            transform: translateX(12px);
          }
          .page-transition-enter {
            opacity: 1;
            transform: translateX(0);
            transition: opacity 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }
          .reader-paragraph {
            text-indent: 2em;
            word-spacing: 0.08em;
          }
          .reader-paragraph + .reader-paragraph {
            margin-top: 0;
          }
          mark {
            background-color: transparent;
            color: inherit;
          }
          .hide-scrollbar::-webkit-scrollbar { display: none; }
          .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `
      }} />

      {/* Top bar - minimal, fades into background */}
      <div
        className="sticky top-0 z-20 min-h-11 backdrop-blur-md flex items-center justify-between px-4"
        style={{
          backgroundColor: "var(--reader-surface)",
          borderBottom: "1px solid var(--reader-border)",
        }}
      >
        {/* Left: Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 min-h-11 px-2 text-base font-semibold active:scale-95 transition-transform"
          style={{ color: "var(--reader-text)" }}
          aria-label="返回首页"
        >
          <span className="text-lg">🏠</span>
          <span>返回</span>
        </button>

        {/* Center: Page indicator */}
        {totalPages > 1 && (
          <span className="text-base font-medium" style={{ color: "var(--reader-text-muted)" }}>
            {currentPage + 1} / {totalPages}
          </span>
        )}

        {/* Right: Recording status (only when active) */}
        <div className="flex items-center gap-2">
          {recordingSubmitted && (
            <span className="text-sm font-semibold text-green-600">
              ✅ 已打卡
            </span>
          )}
          {recordingState !== 'idle' && (
            <span className={`text-base font-bold transition-colors ${
              recordingState === 'recording'
                ? 'text-red-500'
                : recordingState === 'paused'
                  ? 'text-amber-500'
                  : 'text-emerald-500'
            }`}>
              {recordingState === 'recording' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  {formatDuration(recordingDuration)}
                </span>
              ) : recordingState === 'paused' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span>⏸</span>
                  {formatDuration(recordingDuration)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span>✅</span>
                  {formatDuration(recordingDuration)}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Dictionary Popup */}
      {dictLookup && (
        <div
          className="fixed z-50 rounded-xl shadow-2xl border p-4 min-w-[140px] max-w-[200px]"
          style={{ 
            left: Math.min(dictLookup.x, window.innerWidth - 220), 
            top: Math.min(dictLookup.y + 10, window.innerHeight - 120),
            backgroundColor: "var(--reader-surface)",
            borderColor: "var(--reader-border)",
          }}
          onClick={() => setDictLookup(null)}
        >
          <div className="text-3xl font-bold mb-1" style={{ color: "var(--reader-text)" }}>
            {dictLookup.word}
          </div>
          {article.language === "zh" && article.pinyinContent && (
            <div className="text-sm font-medium mb-2" style={{ color: "var(--reader-accent)" }}>
              {getPinyinForChar(dictLookup.word)}
            </div>
          )}
          <div className="text-xs" style={{ color: "var(--reader-text-muted)" }}>
            点击关闭
          </div>
        </div>
      )}

      {/* Content area - single page pagination */}
      <div className="flex-1 overflow-hidden relative">
        <GestureOverlay
          onSwipeLeft={() => goToPage(currentPage + 1)}
          onSwipeRight={() => goToPage(currentPage - 1)}
        >
        {/* Hidden measurement container — measures actual paragraph heights */}
        {!measured && (
          <div
            ref={measureRef}
            aria-hidden="true"
            className="fixed left-0 top-0 w-full px-8 py-6 pointer-events-none"
            style={{
              visibility: 'hidden',
              zIndex: -1,
              fontSize: `${fontSizePx}px`,
              lineHeight: lineHeightValue,
              fontFamily: article.language === "zh"
                ? "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', 'SimSun', serif"
                : "'Inter', 'Source Han Sans SC', 'PingFang SC', system-ui, sans-serif",
            }}
          >
            <div className="max-w-3xl mx-auto space-y-1.5">
              {paragraphs.map((para, i) => {
                const hasIll = illustrationMap.has(i);
                const ill = illustrationMap.get(i);
                return (
                  <div key={i} data-measure-block>
                    <p className="reader-paragraph" style={{ color: 'transparent' }}>{para}</p>
                    {hasIll && ill && (
                      <div style={{ marginTop: '16px', marginBottom: '24px' }}>
                        <div style={{ width: '100%', height: '192px' }} />
                        {ill.scene_description && (
                          <div style={{ fontSize: '12px', marginTop: '8px', height: '16px' }} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
        {/* Page turn zones - left and right edges, wider for easier touch */}
        {totalPages > 1 && (
          <>
            <div
              className="absolute left-0 top-0 bottom-0 z-10"
              style={{ width: '20%', cursor: 'w-resize' }}
              onClick={(e) => { e.stopPropagation(); goToPage(currentPage - 1); }}
              role="button"
              aria-label="上一页"
            />
            <div
              className="absolute right-0 top-0 bottom-0 z-10"
              style={{ width: '20%', cursor: 'e-resize' }}
              onClick={(e) => { e.stopPropagation(); goToPage(currentPage + 1); }}
              role="button"
              aria-label="下一页"
            />
          </>
        )}

        {/* Page content with transition */}
        <div
          ref={containerRef}
          className={`h-[calc(100vh-44px-56px)] overflow-y-auto hide-scrollbar px-8 py-6 ${isTransitioning ? 'page-transition' : 'page-transition-enter'}`}
        >
          <div
            className="max-w-3xl mx-auto space-y-1.5"
            style={{
              color: "var(--reader-text)",
              fontSize: `${fontSizePx}px`,
              lineHeight: lineHeightValue,
              fontFamily: article.language === "zh"
                ? "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', 'SimSun', serif"
                : "'Inter', 'Source Han Sans SC', 'PingFang SC', system-ui, sans-serif",
            }}
          >
            {!measured ? (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <div className="animate-pulse space-y-4 w-full max-w-3xl">
                  <div className="h-8 w-3/4 rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.2 }} />
                  <div className="h-4 w-full rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
                  <div className="h-4 w-5/6 rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
                  <div className="h-4 w-4/5 rounded" style={{ backgroundColor: "var(--reader-text-muted)", opacity: 0.15 }} />
                </div>
              </div>
            ) : (
            <>
            {/* Title section - only show on first page */}
            {currentPage === 0 && (
              <div className="mb-6 pb-4 border-b" style={{ borderColor: "var(--reader-border)" }}>
                <h1 className="text-2xl font-bold mb-2" style={{ fontSize: `${fontSizePx * 1.4}px`, color: "var(--reader-text)" }}>
                  {article.title}
                </h1>
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--reader-text-muted)" }}>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                    G{article.gradeLevel}
                  </span>
                  <span>{article.category}</span>
                  <span>约 {article.estimatedMinutes} 分钟</span>
                </div>
              </div>
            )}

            {pageParagraphs.map(({ text, globalIndex }) => {
              const hasIllustration = illustrationMap.has(globalIndex);
              // Add section break before first paragraph of each page (except page 0)
              const showSectionBreak = currentPage > 0 && globalIndex === pageBreaks[currentPage] && globalIndex > 0;
              return (
                <div key={globalIndex}>
                  {showSectionBreak && (
                    <div className="flex items-center justify-center gap-3 my-6">
                      <div className="w-8 h-px" style={{ backgroundColor: "var(--reader-border)" }} />
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--reader-accent)", opacity: 0.5 }} />
                      <div className="w-8 h-px" style={{ backgroundColor: "var(--reader-border)" }} />
                    </div>
                  )}
                  <p className="reader-paragraph">{renderParagraph(text, globalIndex)}</p>
                  {hasIllustration && (
                    <figure className="mt-4 mb-6 rounded-xl overflow-hidden shadow-sm">
                      <img
                        src={`${illustrationMap.get(globalIndex)!.image_url}?width=600`}
                        alt={illustrationMap.get(globalIndex)!.scene_description || "段落配图"}
                        className="w-full max-h-48 object-cover"
                      />
                      {illustrationMap.get(globalIndex)!.scene_description && (
                        <figcaption className="text-xs mt-2 text-center" style={{ color: "var(--reader-text-muted)" }}>
                          {illustrationMap.get(globalIndex)!.scene_description}
                        </figcaption>
                      )}
                    </figure>
                  )}
                </div>
              );
            })}
            </>
            )}
          </div>
        </div>
        </GestureOverlay>
      </div>

      {/* Bottom simplified toolbar */}
      <div
        className="fixed bottom-0 left-0 right-0 h-14 flex items-center justify-center px-4 z-20"
        style={{
          backgroundColor: "var(--reader-surface)",
          borderTop: "1px solid var(--reader-border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-4">
          {/* Previous page button */}
          <button
            onClick={() => goToPage(currentPage - 1)}
            className="flex items-center justify-center w-12 h-12 rounded-full transition-all active:scale-95"
            style={{
              color: currentPage > 0 ? 'var(--reader-text-muted)' : 'transparent',
              pointerEvents: currentPage > 0 ? 'auto' : 'none',
            }}
            aria-label="上一页"
            disabled={currentPage <= 0}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          {/* Read aloud button - primary action during reading */}
          <button
            onClick={handleTTS}
            className="flex items-center gap-2 px-5 py-3 rounded-full text-base font-semibold transition-all active:scale-95"
            style={{
              backgroundColor: ttsPlaying ? 'var(--reader-accent)' : 'var(--reader-highlight)',
              color: ttsPlaying ? 'var(--reader-bg)' : 'var(--reader-accent)',
            }}
          >
            {ttsPlaying && !ttsPaused ? (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : ttsPaused ? (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            ) : (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
            <span className="text-base">
              {ttsPlaying && !ttsPaused ? '暂停' : ttsPaused ? '继续' : '朗读'}
            </span>
          </button>

          {/* Recording button - secondary action */}
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
            className="flex items-center gap-2 px-5 py-3 rounded-full text-base font-semibold transition-all active:scale-95"
            style={{
              backgroundColor: recordingState === 'recording' ? '#EF4444' : recordingState === 'stopped' ? '#22C55E' : 'var(--reader-highlight)',
              color: recordingState === 'recording' || recordingState === 'stopped' ? 'white' : 'var(--reader-accent)',
            }}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
            <span className="text-base">
              {recordingState === 'idle' ? '录音' :
               recordingState === 'recording' ? '暂停' :
               recordingState === 'paused' ? '继续' :
               '完成'}
            </span>
          </button>

          {/* Quiz button */}
          <button
            onClick={hasReadAll ? onStartQuiz : undefined}
            disabled={!hasReadAll}
            title={!hasReadAll ? "请先读完所有页面" : ""}
            className={`flex items-center gap-2 px-5 py-3 rounded-full text-base font-semibold text-white transition-all active:scale-95 ${!hasReadAll ? 'opacity-40 cursor-not-allowed' : ''}`}
            style={{ backgroundColor: "var(--reader-accent)" }}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <span className="text-base">答题</span>
          </button>

          {/* Settings button - minimal icon */}
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="flex items-center justify-center w-12 h-12 rounded-full transition-all"
            style={{ color: "var(--reader-text-muted)" }}
            aria-label="设置"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* Next page button */}
          <button
            onClick={() => goToPage(currentPage + 1)}
            className="flex items-center justify-center w-12 h-12 rounded-full transition-all active:scale-95"
            style={{
              color: currentPage < totalPages - 1 ? 'var(--reader-text-muted)' : 'transparent',
              pointerEvents: currentPage < totalPages - 1 ? 'auto' : 'none',
            }}
            aria-label="下一页"
            disabled={currentPage >= totalPages - 1}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Settings menu */}
      {showMoreMenu && (
        <div
          className="fixed bottom-16 right-4 rounded-2xl shadow-xl p-4 z-30 min-w-[220px]"
          style={{ backgroundColor: "var(--reader-surface)", border: "1px solid var(--reader-border)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-4">
            {/* Font size */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: "var(--reader-text)" }}>
                字体大小
              </label>
              <div className="flex gap-2">
                {([
                  { value: 'small' as const, label: '小' },
                  { value: 'medium' as const, label: '中' },
                  { value: 'large' as const, label: '大' },
                  { value: 'xlarge' as const, label: '特大' },
                ]).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFontSize(option.value)}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: fontSizeContext === option.value ? 'var(--reader-accent)' : 'var(--reader-border)',
                      color: fontSizeContext === option.value ? 'var(--reader-bg)' : 'var(--reader-text)',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: "var(--reader-text)" }}>阅读主题</label>
              <div className="flex gap-2">
                {(['light', 'sepia', 'dark'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setTheme(theme)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      readerThemeContext === theme
                        ? 'bg-forest-500 text-white shadow-md'
                        : 'hover:bg-gray-200'
                    }`}
                    style={{
                      backgroundColor: readerThemeContext === theme ? 'var(--reader-accent)' : 'var(--reader-border)',
                      color: readerThemeContext === theme ? 'var(--reader-bg)' : 'var(--reader-text)',
                    }}
                  >
                    {theme === 'light' ? '浅色' : theme === 'sepia' ? '护眼' : '深色'}
                  </button>
                ))}
              </div>
            </div>

            {/* TTS Speed */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: "var(--reader-text)" }}>
                朗读速度: {ttsRate.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={ttsRate}
                onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-forest-500"
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: "var(--reader-text-muted)" }}>
                <span>慢</span>
                <span>正常</span>
                <span>快</span>
              </div>
            </div>
          </div>
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
                    alert('打卡成功！获得 10 积分');
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
                      <span className="animate-spin">...</span>
                      <span>上传中 {uploadProgress}%</span>
                    </>
                  ) : (
                    <>
                      上传
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
                重新录音
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