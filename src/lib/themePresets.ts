export interface DarkPreset {
  id: string;
  name: string;
  color: string;
  viewportColor: string;
  desc: string;
}

export interface LightPreset {
  id: string;
  name: string;
  color: string;
  viewportColor: string;
  desc: string;
}

export interface TextToneOption {
  id: string;
  name: string;
  textColorDark: string;
  textColorLight: string;
  filterTone: string;
  desc: string;
}

export const DARK_PRESETS: DarkPreset[] = [
  {
    id: "oled",
    name: "Hitam OLED (Pitch Black)",
    color: "#000000",
    viewportColor: "#050505",
    desc: "Kontras maksimal, hemat baterai layar AMOLED",
  },
  {
    id: "charcoal",
    name: "Arang Modern (Charcoal)",
    color: "#18181b",
    viewportColor: "#121215",
    desc: "Gelap modern, lembut di mata untuk waktu baca lama",
  },
  {
    id: "midnight",
    name: "Midnight Navy",
    color: "#0b1329",
    viewportColor: "#070c1a",
    desc: "Nuansa biru malam tenang untuk fokus",
  },
  {
    id: "espresso",
    name: "Espresso Warm Dark",
    color: "#1c1917",
    viewportColor: "#141210",
    desc: "Cokelat gelap hangat, minim cahaya biru sebelum tidur",
  },
  {
    id: "slate",
    name: "Slate Gray",
    color: "#1e293b",
    viewportColor: "#0f172a",
    desc: "Abu-abu seimbang dengan kenyamanan visual optimal",
  },
  {
    id: "emerald",
    name: "Forest Night",
    color: "#061a14",
    viewportColor: "#03100c",
    desc: "Nuansa hijau hutan redup yang menenangkan mata lelah",
  },
];

export const LIGHT_PRESETS: LightPreset[] = [
  {
    id: "paper",
    name: "Putih Kertas (Pure White)",
    color: "#ffffff",
    viewportColor: "#f3f4f6",
    desc: "Tampilan kertas standar yang jernih dan tajam",
  },
  {
    id: "cream",
    name: "Krem Lembut (Soft Cream)",
    color: "#fcfaf4",
    viewportColor: "#f4efe4",
    desc: "Mengurangi silau cahaya putih saat siang hari",
  },
  {
    id: "sepia",
    name: "Sepia Klasik (Warm Book)",
    color: "#f4ecd8",
    viewportColor: "#eae0c8",
    desc: "Sensasi membaca buku fisik klasik yang hangat",
  },
  {
    id: "mint",
    name: "Mint Sejuk (Cool Mint)",
    color: "#f0fdf4",
    viewportColor: "#e2f3e8",
    desc: "Nuansa hijau pastel yang menyegarkan pandangan",
  },
];

export const TEXT_TONES: TextToneOption[] = [
  {
    id: "default",
    name: "Standar (Crisp)",
    textColorDark: "#f8fafc",
    textColorLight: "#0f172a",
    filterTone: "none",
    desc: "Kontras seimbang dan sangat tajam",
  },
  {
    id: "warm",
    name: "Hangat (Warm Ivory)",
    textColorDark: "#fed7aa",
    textColorLight: "#451a03",
    filterTone: "sepia(0.25)",
    desc: "Teks kekuningan lembut ramah mata malam hari",
  },
  {
    id: "cool",
    name: "Sejuk (Cool Ice)",
    textColorDark: "#e0f2fe",
    textColorLight: "#0c4a6e",
    filterTone: "hue-rotate(15deg)",
    desc: "Teks bernuansa kebiruan yang jernih",
  },
  {
    id: "sage",
    name: "Sage (Soft Green)",
    textColorDark: "#d1fae5",
    textColorLight: "#064e3b",
    filterTone: "hue-rotate(60deg)",
    desc: "Teks kehijauan yang menenangkan saraf mata",
  },
  {
    id: "soft",
    name: "Redup (Low Glare)",
    textColorDark: "#cbd5e1",
    textColorLight: "#334155",
    filterTone: "brightness(0.9) contrast(0.95)",
    desc: "Teks lebih redup untuk kenyamanan maksimal di ruangan gelap gulita",
  },
];

export interface FontOption {
  id: "sans" | "serif" | "literata" | "mono" | "dyslexic";
  name: string;
  fontFamily: string;
  sample: string;
  desc: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "sans",
    name: "Modern Sans (Jakarta)",
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    sample: "Aa",
    desc: "Sangat bersih dan optimal untuk dokumen umum, laporan, dan artikel bisnis",
  },
  {
    id: "serif",
    name: "Classic Serif (Newsreader)",
    fontFamily: "'Newsreader', Georgia, 'Times New Roman', serif",
    sample: "Aa",
    desc: "Sangat nyaman untuk membaca buku cerita, novel, literatur, dan esai panjang",
  },
  {
    id: "literata",
    name: "Literata Book",
    fontFamily: "'Literata', 'Merriweather', Georgia, serif",
    sample: "Aa",
    desc: "Tipografi buku sastra elegan dengan lengkung huruf yang memikat",
  },
  {
    id: "mono",
    name: "JetBrains Mono",
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    sample: "{;}",
    desc: "Sempurna untuk kode pemrograman, tabel angka, dan dokumentasi teknis",
  },
  {
    id: "dyslexic",
    name: "Dyslexic Friendly (Atkinson)",
    fontFamily: "'Atkinson Hyperlegible', system-ui, sans-serif",
    sample: "Aa",
    desc: "Desain huruf berbobot khusus dengan jarak ekstra untuk kemudahan membaca",
  },
];

