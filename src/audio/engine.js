import { settings, setSetting } from '../settings.js';

// Motor de áudio: um AudioContext, dois barramentos (música e efeitos) e
// um carregador opcional de arquivos. Sem arquivos, tudo é sintetizado.
export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let ambienceBus = null;
  let mixFilter = null;
  let noiseBuffer = null;
  const samples = new Map();
  let loading = Promise.resolve();

  function applyVolume() {
    if (!master) return;
    const value = settings.muted ? 0 : settings.volume;
    master.gain.setTargetAtTime(value, ctx.currentTime, 0.03);
  }

  function createNoiseBuffer() {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Arquivos são opcionais: o manifesto lista quais ids têm áudio próprio.
  async function loadManifest() {
    const base = import.meta.env.BASE_URL ?? './';
    let manifest;
    try {
      const response = await fetch(`${base}audio/manifest.json`);
      if (!response.ok) return;
      manifest = await response.json();
    } catch {
      return; // sem manifesto: segue 100% procedural
    }

    await Promise.all(
      Object.entries(manifest).map(async ([id, file]) => {
        // Chaves iniciadas por "_" são comentários do manifesto.
        if (!file || id.startsWith('_') || typeof file !== 'string') return;
        try {
          const response = await fetch(`${base}audio/${file}`);
          if (!response.ok) return;
          const data = await response.arrayBuffer();
          samples.set(id, await ctx.decodeAudioData(data));
        } catch {
          console.warn(`[audio] não consegui carregar "${file}" (id "${id}"); usando som sintetizado.`);
        }
      }),
    );
  }

  // Só cria o contexto depois de um gesto do usuário (política dos navegadores).
  function unlock() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
      master = ctx.createGain();
      // Limitador no fim da cadeia: sons sintetizados se somam e estouram fácil.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      master.connect(limiter).connect(ctx.destination);
      // Todos os sons do jogo passam por este filtro antes do volume geral:
      // é ele que "abafa o mundo" no zumbido pós-impacto.
      mixFilter = ctx.createBiquadFilter();
      mixFilter.type = 'lowpass';
      mixFilter.frequency.value = 22000;
      mixFilter.Q.value = 0.7;
      mixFilter.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(mixFilter);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(mixFilter);
      // Ambiente (vento, corvos, fogueira, trovão): barramento próprio, baixo.
      ambienceBus = ctx.createGain();
      ambienceBus.gain.value = 0.8;
      ambienceBus.connect(mixFilter);
      noiseBuffer = createNoiseBuffer();
      applyVolume();
      loading = loadManifest();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Instante (s) do pico de volume do sample: com fromPeak o som começa ali,
  // para o golpe do arquivo cair no quadro exato do impacto.
  const peaks = new Map();
  function peakOffset(id, buffer) {
    if (!peaks.has(id)) {
      const data = buffer.getChannelData(0);
      let best = 0;
      let at = 0;
      for (let i = 0; i < data.length; i += 16) {
        const v = Math.abs(data[i]);
        if (v > best) {
          best = v;
          at = i;
        }
      }
      peaks.set(id, Math.max(0, at / buffer.sampleRate - 0.02));
    }
    return peaks.get(id);
  }

  function playSample(id, { gain = 1, rate = 1, fromPeak = false } = {}) {
    const buffer = samples.get(id);
    if (!buffer || !ctx) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const volume = ctx.createGain();
    volume.gain.value = gain;
    source.connect(volume).connect(sfxBus);
    source.start(0, fromPeak ? peakOffset(id, buffer) : 0);
    return true;
  }

  // Zumbido: o mundo inteiro fica abafado por ~`seconds` e um apito agudo e
  // fraco toca por cima (fora do filtro, mas ainda no volume geral).
  function muffle(seconds = 1.6) {
    if (!ctx || !mixFilter) return;
    const now = ctx.currentTime;
    const f = mixFilter.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(Math.max(300, f.value), now);
    f.exponentialRampToValueAtTime(340, now + 0.05);
    f.setValueAtTime(340, now + seconds * 0.35);
    f.exponentialRampToValueAtTime(22000, now + seconds);

    const ring = ctx.createGain();
    ring.gain.setValueAtTime(0.0001, now);
    ring.gain.exponentialRampToValueAtTime(0.022, now + 0.08);
    ring.gain.setValueAtTime(0.022, now + seconds * 0.4);
    ring.gain.exponentialRampToValueAtTime(0.0001, now + seconds * 1.05);
    ring.connect(master);
    for (const freq of [3520, 3534]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(ring);
      osc.start(now);
      osc.stop(now + seconds * 1.1);
    }
  }

  return {
    unlock,
    muffle,
    playSample,
    // Resolve quando os arquivos do manifesto (se houver) terminaram de carregar.
    whenLoaded: () => loading,
    getSample: (id) => samples.get(id),
    get ctx() {
      return ctx;
    },
    get master() {
      return master;
    },
    get ready() {
      return !!ctx;
    },
    get sfxBus() {
      return sfxBus;
    },
    get musicBus() {
      return musicBus;
    },
    get ambienceBus() {
      return ambienceBus;
    },
    get noiseBuffer() {
      return noiseBuffer;
    },
    setVolume(value) {
      setSetting('volume', Math.min(1, Math.max(0, value)));
      applyVolume();
    },
    setMuted(value) {
      setSetting('muted', !!value);
      applyVolume();
    },
  };
}
