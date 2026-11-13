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
