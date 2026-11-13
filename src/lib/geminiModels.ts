import { GeminiTtsModelId, GeminiTtsModelOption } from "../types";

export const DEFAULT_GEMINI_TTS_MODEL: GeminiTtsModelId = "gemini-3.8-flash-lite-tts";

export function normalizeGeminiTtsModel(model?: string | null): GeminiTtsModelId {
  if (model === "gemini-3.8-flash-tts" || model === "gemini-3.8-flash") {
    return "gemini-3.8-flash-tts";
  }
  return "gemini-3.8-flash-lite-tts";
}

export const GEMINI_TTS_MODELS: GeminiTtsModelOption[] = [
  {
    id: "gemini-3.8-flash-lite-tts",
    name: "Gemini 3.8 Flash Lite TTS (Default Stream)",
    shortLabel: "3.8 Flash Lite TTS",
    badge: "⚡ Ultra Low Latency Stream",
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    description:
      "Model TTS generasi 3.8 berkecepatan tinggi dengan metode streaming real-time. Suara langsung diputar seketika tanpa menunggu selesai generate.",
    latency: "ultra-low",
  },
  {
    id: "gemini-3.8-flash-tts",
    name: "Gemini 3.8 Flash TTS (Studio Stream)",
    shortLabel: "3.8 Flash TTS",
    badge: "🎙️ Flagship Studio Stream",
    badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    description:
      "Model TTS flagship 3.8 dengan intonasi, ekspresi, dan kejernihan suara terbaik menggunakan streaming audio progresif.",
    latency: "low",
  },
];

export interface GeminiVoiceOption {
  id: string;
  name: string;
  tone: string;
  gender: "female" | "male";
  description: string;
  isNew38?: boolean;
}

export const GEMINI_VOICE_OPTIONS: GeminiVoiceOption[] = [
  // Suara Terbaru Gemini 3.8 TTS
  {
    id: "Fola",
    name: "Fola",
    tone: "Jelas & Ramah",
    gender: "female",
    isNew38: true,
    description: "Suara wanita jernih, bernada sedang, ramah, dan natural. Sangat cocok untuk narasi buku dan pembacaan dokumen panjang.",
  },
  {
    id: "Tavi",
    name: "Tavi",
    tone: "Intim & Hangat",
    gender: "female",
    isNew38: true,
    description: "Gaya bicara dekat dan intim ala talk-show dengan artikulasi halus, nyaman untuk diskusi dan cerita.",
  },
  {
    id: "Arlo",
    name: "Arlo",
    tone: "Percaya Diri & Stabil",
    gender: "male",
    isNew38: true,
    description: "Suara pria tegas, jernih, dan mantap untuk materi edukasi, presentasi, dan laporan profesional.",
  },
  {
    id: "Gero",
    name: "Gero",
    tone: "Ramah & Terartikulasi",
    gender: "male",
    isNew38: true,
    description: "Suara pria bernada sedang yang hangat dan bersahabat untuk bacaan non-fiksi dan artikel.",
  },
  {
    id: "Hali",
    name: "Hali",
    tone: "Lembut & Menenangkan",
    gender: "female",
    isNew38: true,
    description: "Suara wanita halus dan menenangkan dengan aliran kata lembut, ideal untuk belajar malam hari.",
  },
  {
    id: "Lora",
    name: "Lora",
    tone: "Narasi Natural",
    gender: "female",
    isNew38: true,
    description: "Suara wanita jernih dan seimbang untuk pembacaan buku, esai, dan panduan teknis.",
  },
  {
    id: "Tari",
    name: "Tari",
    tone: "Ceria & Ekspresif",
    gender: "female",
    isNew38: true,
    description: "Intonasi hidup, ekspresif, dan menarik untuk konten kreatif maupun dialog interaktif.",
  },
  {
    id: "Cleo",
    name: "Cleo",
    tone: "Modern & Tajam",
    gender: "female",
    isNew38: true,
    description: "Artikulasi modern yang presisi dan bersih untuk ringkasan berita maupun riset.",
  },
  {
    id: "Finn",
    name: "Finn",
    tone: "Santai & Mengalir",
    gender: "male",
    isNew38: true,
    description: "Gaya bertutur santai, muda, dan kasual agar bacaan terasa seperti dijelaskan langsung.",
  },
  {
    id: "Neno",
    name: "Neno",
    tone: "Dinamis & Bertutur",
    gender: "male",
    isNew38: true,
    description: "Suara bercerita yang dinamis dengan penekanan intonasi yang hidup.",
  },
  {
    id: "Olin",
    name: "Olin",
    tone: "Tenang & Berbobot",
    gender: "male",
    isNew38: true,
    description: "Suara pria dewasa yang tenang, mendalam, dan berwibawa untuk bacaan serius.",
  },
  // Suara Studio Klasik
  {
    id: "Aoede",
    name: "Aoede",
    tone: "Hangat & Bersahabat",
    gender: "female",
    description: "Suara hangat, bersahabat, dan artikulatif untuk mendengarkan bacaan buku.",
  },
  {
    id: "Kore",
    name: "Kore",
    tone: "Tenang & Lembut",
    gender: "female",
    description: "Intonasi lembut dan santai, nyaman didengar untuk membaca dokumen panjang.",
  },
  {
    id: "Puck",
    name: "Puck",
    tone: "Ramah & Energik",
    gender: "male",
    description: "Suara bersahabat dan ekspresif, cocok untuk artikel berita dan presentasi.",
  },
  {
    id: "Fenrir",
    name: "Fenrir",
    tone: "Berwibawa & Dalam",
    gender: "male",
    description: "Suara mantap dan percaya diri, ideal untuk laporan resmi dan materi hukum/teknis.",
  },
  {
    id: "Charon",
    name: "Charon",
    tone: "Formal & Tegas",
    gender: "male",
    description: "Artikulasi sangat tajam, cocok untuk teks akademik dan dokumen saintifik.",
  },
  {
    id: "Zephyr",
    name: "Zephyr",
    tone: "Santai & Cerah",
    gender: "female",
    description: "Percakapan natural, cerah, dan mengalir ringan.",
  },
  {
    id: "Leda",
    name: "Leda",
    tone: "Muda & Segar",
    gender: "female",
    description: "Nada suara muda dan segar untuk pembacaan cepat yang jelas.",
  },
  {
    id: "Orus",
    name: "Orus",
    tone: "Mantap & Profesional",
    gender: "male",
    description: "Artikulasi tegas dan terstruktur untuk dokumen bisnis maupun instruksional.",
  },
  {
    id: "Sulafat",
    name: "Sulafat",
    tone: "Hangat & Empatik",
    gender: "female",
    description: "Suara lembut penuh kehangatan untuk bacaan literatur dan refleksi.",
  },
];
