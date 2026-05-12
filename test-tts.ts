import { config } from "dotenv";
config({ path: ".env.local" });

import { synthesizeChinese, isTtsConfigured } from "./src/lib/reading/tts-azure-client.ts";

console.log("TTS configured:", isTtsConfigured());

const result = await synthesizeChinese({
  text: "你好世界，这是一段测试语音。",
  voice: "zh-CN-XiaoxiaoNeural"
});

console.log("✅ Synthesized! Audio size:", result.audioBytes.length, "bytes");
console.log("Voice:", result.voice);
console.log("Duration estimate:", result.durationSecondsEstimate, "s");