import { STORY_CHAPTERS } from "./constants.js";

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this.muted = false;
    this.isNarrating = false;
    this._narrationToken = 0;
    this._fallbackVocalTimers = [];
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;
    this.master.connect(compressor);

    this.reverb = this._createImpulseReverb(1.4, 2.8);
    if (this.reverb) {
      const wet = this.ctx.createGain();
      wet.gain.value = 0.24;
      this.reverb.connect(wet);
      wet.connect(this.master);
    }
  }

  _createImpulseReverb(duration, decay) {
    if (!this.ctx) return null;
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = impulse;
    return conv;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.04);
    }
    if (muted) {
      this.stopNarration();
    }
  }

  _routeNode(node) {
    if (!this.master) return;
    node.connect(this.master);
    if (this.reverb) node.connect(this.reverb);
  }

  playElementAttack(elementId) {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    if (elementId === 0) {
      // Fogo: warm whoosh + crackle
      this._noiseBurst(0.24, 900, "bandpass", 0.28);
      this._tone(190, 82, 0.22, "sawtooth", 0.18, now);
    } else if (elementId === 1) {
      // Trovão: sharp electric snap + sub rumble
      this._tone(980, 140, 0.14, "square", 0.16, now);
      this._tone(110, 46, 0.3, "triangle", 0.25, now);
    } else if (elementId === 2) {
      // Vento: airy resonant sweep
      this._noiseBurst(0.28, 1600, "bandpass", 0.22);
      this._tone(420, 680, 0.22, "sine", 0.12, now);
    } else {
      // Luz Divina: crystal harmonic chord
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        this._tone(freq, freq * 1.04, 0.35, "sine", 0.09, now + idx * 0.025);
      });
    }
  }

  playEnemyDefeat(formId) {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    switch (formId) {
      case "bestial":
        // Som especial exclusivo Bestial: rugido grave descendente + estalo metálico
        this._tone(175, 52, 0.42, "sawtooth", 0.24, now);
        this._tone(260, 95, 0.32, "square", 0.12, now + 0.04);
        this._noiseBurst(0.22, 480, "lowpass", 0.2);
        break;
      case "animalia":
        // Som especial exclusivo Animália: silvo orgânico ágil + trinado natural
        this._tone(620, 980, 0.14, "triangle", 0.18, now);
        this._tone(880, 340, 0.26, "sine", 0.18, now + 0.12);
        this._noiseBurst(0.18, 2200, "bandpass", 0.14);
        break;
      case "divino_luz":
        // Som especial exclusivo Divino da Luz: arpejo celestial cristalino
        [587.33, 739.99, 880, 1174.66].forEach((f, idx) => {
          this._tone(f, f * 1.02, 0.38, "sine", 0.12, now + idx * 0.045);
        });
        break;
      case "divino_trevas":
        // Som especial exclusivo Divino das Trevas: pulso etéreo invertido + subgrave
        this._tone(310, 145, 0.45, "triangle", 0.22, now);
        this._tone(465, 220, 0.42, "sawtooth", 0.11, now + 0.03);
        this._noiseBurst(0.32, 700, "bandpass", 0.16);
        break;
      default:
        this._tone(440, 220, 0.25, "sine", 0.15, now);
        break;
    }
  }

  playKeyPickup() {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    this._tone(880, 1318.5, 0.16, "sine", 0.16, now);
    this._tone(1318.5, 1760, 0.22, "triangle", 0.12, now + 0.05);
  }

  playAuraDivina() {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [261.63, 329.63, 392.0, 523.25, 659.25].forEach((freq, i) => {
      this._tone(freq, freq * 1.01, 1.3, "sine", 0.11, now + i * 0.05);
    });
  }

  playPortalWarp() {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    this._tone(220, 880, 0.65, "sine", 0.2, now);
    this._tone(330, 1100, 0.7, "triangle", 0.14, now + 0.06);
    this._noiseBurst(0.55, 1200, "bandpass", 0.18);
  }

  playBossEvent(isDefeat = false) {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (isDefeat) {
      [392, 493.88, 587.33, 783.99].forEach((f, i) => {
        this._tone(f, f, 0.48, "triangle", 0.16, now + i * 0.08);
      });
    } else {
      this._tone(110, 73.42, 0.6, "sawtooth", 0.24, now);
      this._tone(146.83, 98, 0.6, "square", 0.12, now + 0.08);
    }
  }

  playSoftExplosion() {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    this._tone(96, 36, 0.4, "sine", 0.2, now);
    this._noiseBurst(0.35, 380, "lowpass", 0.18);
  }

  _tone(fStart, fEnd, dur, type, vol, startTime) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fStart, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), startTime + dur);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + dur);

    osc.connect(gain);
    this._routeNode(gain);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
  }

  _noiseBurst(dur, cutoff, filterType, vol) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoff, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    this._routeNode(gain);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  // Narração em português fatiada por frases com speechSynthesis pt-BR + fallback vocal Web Audio + bridge Android TTS
  startStoryNarration(onParagraphIndex, onStatusChange) {
    this.init();
    this.stopNarration();
    this.isNarrating = true;
    const token = ++this._narrationToken;

    const sentences = [];
    STORY_CHAPTERS.forEach((chapter, pIndex) => {
      const parts = chapter.match(/[^.!?]+[.!?]+/g) || [chapter];
      parts.forEach((part) => {
        const trimmed = part.trim();
        if (trimmed) sentences.push({ text: trimmed, pIndex });
      });
    });

    const hasSpeechApi =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof window.SpeechSynthesisUtterance === "function";

    const hasAndroidTts =
      typeof window !== "undefined" &&
      window.AndroidBridge &&
      typeof window.AndroidBridge.speakPtBr === "function";

    let idx = 0;
    const speakNext = () => {
      if (!this.isNarrating || token !== this._narrationToken) return;
      if (idx >= sentences.length) {
        this.isNarrating = false;
        onParagraphIndex(-1);
        onStatusChange("Narração concluída.");
        return;
      }

      const item = sentences[idx++];
      onParagraphIndex(item.pIndex);
      onStatusChange(`Narrando capítulo ${item.pIndex + 1} de ${STORY_CHAPTERS.length}...`);

      // Subtle Web Audio harmonic voice bed so audio is always perceptible
      this._playVocalFormantPhrase(item.text);

      if (hasSpeechApi) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(item.text);
          utter.lang = "pt-BR";
          utter.rate = 0.98;
          utter.pitch = 1.0;

          const voices = window.speechSynthesis.getVoices() || [];
          const ptVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("pt"));
          if (ptVoice) utter.voice = ptVoice;

          let settled = false;
          const safetyMs = Math.max(2600, Math.min(11000, item.text.length * 68));
          const watchdog = setTimeout(() => {
            if (!settled) {
              settled = true;
              speakNext();
            }
          }, safetyMs);

          utter.onend = () => {
            if (!settled) {
              settled = true;
              clearTimeout(watchdog);
              speakNext();
            }
          };
          utter.onerror = () => {
            if (!settled) {
              settled = true;
              clearTimeout(watchdog);
              if (hasAndroidTts) {
                window.AndroidBridge.speakPtBr(item.text);
              }
              const wait = Math.max(2200, Math.min(8500, item.text.length * 58));
              const t = setTimeout(speakNext, wait);
              this._fallbackVocalTimers.push(t);
            }
          };

          window.speechSynthesis.speak(utter);
          return;
        } catch {
          // Fall through to Android TTS / Web Audio formant fallback
        }
      }

      if (hasAndroidTts) {
        window.AndroidBridge.speakPtBr(item.text);
      }

      const durationMs = Math.max(2500, Math.min(9000, item.text.length * 62));
      const timer = setTimeout(speakNext, durationMs);
      this._fallbackVocalTimers.push(timer);
    };

    speakNext();
  }

  _playVocalFormantPhrase(text) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const syllables = Math.min(8, Math.max(3, Math.floor(text.length / 18)));
    const vowelFormants = [
      [730, 1090], // a
      [530, 1840], // e
      [270, 2290], // i
      [570, 840],  // o
      [300, 870],  // u
    ];

    for (let s = 0; s < syllables; s++) {
      const t = now + s * 0.19;
      const formants = vowelFormants[(text.charCodeAt(s) || s) % vowelFormants.length];
      const basePitch = 132 + ((text.charCodeAt(s % text.length) || 60) % 28);

      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(basePitch, t);
      osc.frequency.linearRampToValueAtTime(basePitch * 0.94, t + 0.16);

      const f1 = this.ctx.createBiquadFilter();
      f1.type = "bandpass";
      f1.frequency.setValueAtTime(formants[0], t);
      f1.Q.value = 5.5;

      const f2 = this.ctx.createBiquadFilter();
      f2.type = "bandpass";
      f2.frequency.setValueAtTime(formants[1], t);
      f2.Q.value = 6.5;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.045, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);

      osc.connect(f1);
      osc.connect(f2);
      f1.connect(gain);
      f2.connect(gain);
      this._routeNode(gain);

      osc.start(t);
      osc.stop(t + 0.18);
    }
  }

  stopNarration() {
    this.isNarrating = false;
    this._narrationToken++;
    this._fallbackVocalTimers.forEach((t) => clearTimeout(t));
    this._fallbackVocalTimers = [];
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {}
    try {
      if (window.AndroidBridge && window.AndroidBridge.stopSpeakPtBr) {
        window.AndroidBridge.stopSpeakPtBr();
      }
    } catch {}
  }
}
