import { settings, setSetting } from '../settings.js';

// Motor de áudio: um AudioContext, dois barramentos (música e efeitos) e
// um carregador opcional de arquivos. Sem arquivos, tudo é sintetizado.
export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
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
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      noiseBuffer = createNoiseBuffer();
      applyVolume();
      loading = loadManifest();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function playSample(id, { gain = 1, rate = 1 } = {}) {
    const buffer = samples.get(id);
    if (!buffer || !ctx) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const volume = ctx.createGain();
    volume.gain.value = gain;
    source.connect(volume).connect(sfxBus);
    source.start();
    return true;
  }

  return {
    unlock,
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
