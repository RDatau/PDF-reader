// Audio Utilities for TTS and Real-time Voice Conversations

export class LiveAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime = 0;
  private isPlaying = false;

  constructor(private sampleRate = 24000) {}

  private initCtx() {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: this.sampleRate });
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  public playChunk(base64Pcm: string) {
    this.initCtx();
    if (!this.audioCtx) return;

    try {
      const binaryString = atob(base64Pcm);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const buffer = this.audioCtx.createBuffer(1, float32Array.length, this.sampleRate);
      buffer.copyToChannel(float32Array, 0);

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioCtx.destination);

      const currentTime = this.audioCtx.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.isPlaying = true;

      source.onended = () => {
        if (this.audioCtx && this.nextStartTime <= this.audioCtx.currentTime) {
          this.isPlaying = false;
        }
      };
    } catch (e) {
      console.error("Error playing audio chunk:", e);
    }
  }

  public stop() {
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (e) {
        // ignore
      }
      this.audioCtx = null;
    }
    this.nextStartTime = 0;
    this.isPlaying = false;
  }
}

/**
 * Progressive Streaming PCM Audio Player (24kHz, mono, 16-bit LE)
 * Plays raw PCM chunks immediately as they arrive from Gemini Stream TTS,
 * with full support for Pause, Resume, Stop, Playback Speed, and Drain wait.
 */
export class StreamingTtsPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime = 0;
  private playbackRate = 1.0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private leftoverByte: number | null = null;
  private isFirstChunk = true;
  private isPausedState = false;
  private isStoppedState = true;
  private drainResolver: (() => void) | null = null;

  constructor(private sampleRate = 24000) {}

  public start(rate = 1.0) {
    this.stop();
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass({ sampleRate: this.sampleRate });
    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    this.playbackRate = rate;
    this.nextStartTime = 0;
    this.leftoverByte = null;
    this.isFirstChunk = true;
    this.isPausedState = false;
    this.isStoppedState = false;
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = rate;
  }

  public beginNewUtterance() {
    this.leftoverByte = null;
    this.isFirstChunk = true;
  }

  public enqueuePcmBase64(base64Pcm: string): { startTime: number; duration: number } | null {
    if (this.isStoppedState || !this.audioCtx || !base64Pcm) return null;

    if (this.audioCtx.state === "suspended" && !this.isPausedState) {
      void this.audioCtx.resume();
    }

    try {
      const binaryString = atob(base64Pcm);
      let bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (this.isFirstChunk) {
        this.isFirstChunk = false;
        // Strip 44-byte RIFF/WAVE header if present on initial chunk
        if (
          bytes.length > 44 &&
          bytes[0] === 0x52 &&
          bytes[1] === 0x49 &&
          bytes[2] === 0x46 &&
          bytes[3] === 0x46
        ) {
          bytes = bytes.subarray(44);
        }
      }

      if (this.leftoverByte !== null) {
        const merged = new Uint8Array(bytes.length + 1);
        merged[0] = this.leftoverByte;
        merged.set(bytes, 1);
        bytes = merged;
        this.leftoverByte = null;
      }

      if (bytes.length % 2 !== 0) {
        this.leftoverByte = bytes[bytes.length - 1];
        bytes = bytes.subarray(0, bytes.length - 1);
      }

      if (bytes.length < 2) return null;

      const sampleCount = bytes.length / 2;
      const float32Array = new Float32Array(sampleCount);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let i = 0; i < sampleCount; i++) {
        float32Array[i] = view.getInt16(i * 2, true) / 32768.0;
      }

      const buffer = this.audioCtx.createBuffer(1, float32Array.length, this.sampleRate);
      buffer.copyToChannel(float32Array, 0);

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.playbackRate;
      source.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      const startAt = Math.max(now + 0.02, this.nextStartTime);
      source.start(startAt);

      const effectiveDuration = buffer.duration / this.playbackRate;
      this.nextStartTime = startAt + effectiveDuration;
      this.activeSources.add(source);

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0 && this.drainResolver) {
          const resolve = this.drainResolver;
          this.drainResolver = null;
          resolve();
        }
      };

      return { startTime: startAt, duration: effectiveDuration };
    } catch (e) {
      console.error("Error enqueueing streaming PCM chunk:", e);
      return null;
    }
  }

  public getCurrentTime(): number {
    if (!this.audioCtx || this.isStoppedState) return 0;
    return this.audioCtx.currentTime;
  }

  public getNextStartTime(): number {
    if (!this.audioCtx || this.isStoppedState) return 0;
    return Math.max(this.audioCtx.currentTime, this.nextStartTime);
  }

  public getRemainingSeconds(): number {
    if (!this.audioCtx || this.isStoppedState) return 0;
    return Math.max(0, this.nextStartTime - this.audioCtx.currentTime);
  }

  public hasActiveAudio(): boolean {
    return !this.isStoppedState && this.activeSources.size > 0;
  }

  public async pause() {
    this.isPausedState = true;
    if (this.audioCtx && this.audioCtx.state === "running") {
      try {
        await this.audioCtx.suspend();
      } catch {
        // ignore
      }
    }
  }

  public async resume() {
    this.isPausedState = false;
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch {
        // ignore
      }
    }
  }

  public waitUntilDrain(): Promise<void> {
    if (this.isStoppedState || this.activeSources.size === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.drainResolver = resolve;
    });
  }

  public stop() {
    this.isStoppedState = true;
    this.isPausedState = false;
    this.leftoverByte = null;

    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeSources.clear();

    if (this.drainResolver) {
      const resolve = this.drainResolver;
      this.drainResolver = null;
      resolve();
    }

    if (this.audioCtx) {
      try {
        void this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }
    this.nextStartTime = 0;
  }
}

// Convert mic float32 buffer to 16kHz 16-bit PCM base64 string
export function floatTo16BitPCMBase64(input: Float32Array): string {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const uint8 = new Uint8Array(output.buffer);
  let binary = "";
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

// Offline Web Speech Synthesis Wrapper
export class OfflineSpeechPlayer {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isPaused = false;

  public speak(
    text: string,
    options: {
      rate?: number;
      voiceName?: string;
      onSentenceChange?: (charIndex: number, sentence: string) => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    }
  ) {
    this.stop();
    if (!("speechSynthesis" in window)) {
      options.onError?.(new Error("Web Speech API not supported in this browser"));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance = utterance;
    utterance.rate = options.rate || 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (options.voiceName) {
      const match = voices.find((v) => v.name === options.voiceName);
      if (match) utterance.voice = match;
    }

    utterance.onboundary = (event) => {
      if (event.name === "sentence" || event.name === "word") {
        options.onSentenceChange?.(event.charIndex, text.slice(event.charIndex, event.charIndex + 50));
      }
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      this.isPaused = false;
      options.onEnd?.();
    };

    utterance.onerror = (e) => {
      if (e.error !== "canceled" && e.error !== "interrupted") {
        options.onError?.(e);
      }
      this.currentUtterance = null;
    };

    window.speechSynthesis.speak(utterance);
  }

  public pause() {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      this.isPaused = true;
    }
  }

  public resume() {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      this.isPaused = false;
    }
  }

  public stop() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    this.isPaused = false;
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (!("speechSynthesis" in window)) return [];
    return window.speechSynthesis.getVoices();
  }
}

/**
 * Decodes a base64 PCM chunk into raw Uint8Array bytes.
 * Strips any leading 44-byte RIFF/WAVE header if stripHeader is true.
 */
export function decodeBase64PcmChunk(base64Pcm: string, stripHeader = false): Uint8Array {
  const binaryString = atob(base64Pcm);
  let bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  if (
    stripHeader &&
    bytes.length > 44 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    bytes = bytes.subarray(44);
  }
  return bytes;
}

/**
 * Concatenates raw 16-bit mono PCM chunks into a complete playable & downloadable WAV ArrayBuffer.
 */
export function pcmChunksToWavBuffer(
  chunks: Uint8Array[],
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): { wavBuffer: ArrayBuffer; durationSeconds: number } {
  let totalPcmBytes = 0;
  for (const c of chunks) {
    totalPcmBytes += c.byteLength;
  }

  // Ensure even byte count for 16-bit PCM alignment
  const alignedPcmBytes = totalPcmBytes - (totalPcmBytes % 2);
  const wavBuffer = new ArrayBuffer(44 + alignedPcmBytes);
  const view = new DataView(wavBuffer);
  const outBytes = new Uint8Array(wavBuffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      outBytes[offset + i] = str.charCodeAt(i);
    }
  };

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + alignedPcmBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, alignedPcmBytes, true);

  let cursor = 44;
  let remaining = alignedPcmBytes;
  for (const chunk of chunks) {
    if (remaining <= 0) break;
    const toCopy = chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining);
    outBytes.set(toCopy, cursor);
    cursor += toCopy.byteLength;
    remaining -= toCopy.byteLength;
  }

  const durationSeconds = byteRate > 0 ? alignedPcmBytes / byteRate : 0;
  return { wavBuffer, durationSeconds };
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(""));
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function extractWavPcmData(wavBuffer: ArrayBuffer): {
  pcm: Uint8Array;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
} | null {
  if (!wavBuffer || wavBuffer.byteLength <= 44) return null;
  const view = new DataView(wavBuffer);
  const bytes = new Uint8Array(wavBuffer);
  const readTag = (offset: number) =>
    String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

  if (readTag(0) !== "RIFF" || readTag(8) !== "WAVE") {
    return null;
  }

  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataStart = 44;
  let dataLength = wavBuffer.byteLength - 44;

  let offset = 12;
  while (offset + 8 <= wavBuffer.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "fmt " && offset + 24 <= wavBuffer.byteLength) {
      numChannels = view.getUint16(offset + 10, true) || 1;
      sampleRate = view.getUint32(offset + 12, true) || 24000;
      bitsPerSample = view.getUint16(offset + 22, true) || 16;
    } else if (chunkId === "data") {
      dataStart = offset + 8;
      dataLength = Math.min(chunkSize, wavBuffer.byteLength - dataStart);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataLength <= 0) return null;
  return {
    pcm: bytes.subarray(dataStart, dataStart + dataLength),
    sampleRate,
    numChannels,
    bitsPerSample,
  };
}

/**
 * Local fallback WAV merger used only when offline or when Python backend merge is unreachable.
 */
export function mergeWavArrayBuffersLocal(
  wavBuffers: ArrayBuffer[],
  silenceMs = 180
): { wavBuffer: ArrayBuffer; durationSeconds: number } {
  const pcmChunks: Uint8Array[] = [];
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;

  for (let i = 0; i < wavBuffers.length; i++) {
    const parsed = extractWavPcmData(wavBuffers[i]);
    if (!parsed) continue;
    if (pcmChunks.length === 0) {
      sampleRate = parsed.sampleRate;
      numChannels = parsed.numChannels;
      bitsPerSample = parsed.bitsPerSample;
    } else if (silenceMs > 0) {
      const silenceSamples = Math.floor(sampleRate * (silenceMs / 1000));
      const silenceBytes = silenceSamples * numChannels * (bitsPerSample / 8);
      if (silenceBytes > 0) {
        pcmChunks.push(new Uint8Array(silenceBytes));
      }
    }
    pcmChunks.push(parsed.pcm);
  }

  return pcmChunksToWavBuffer(pcmChunks, sampleRate, numChannels, bitsPerSample);
}
