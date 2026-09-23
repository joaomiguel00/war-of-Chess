// Efeitos sintetizados. Cada som é montado com ruído filtrado + osciladores,
// para não depender de nenhum arquivo externo. Se existir um sample com o
// mesmo id no manifesto, ele tem prioridade.

function envelope(ctx, node, { start, attack, duration, peak }) {
  node.gain.setValueAtTime(0.0001, start);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, start + duration);
}

function noise(engine, options = {}) {
  const {
    duration = 0.2,
    filter = 'lowpass',
    freq = 900,
    freqTo = null,
    q = 1,
    gain = 0.4,
    attack = 0.005,
    delay = 0,
  } = options;

  const ctx = engine.ctx;
  const start = ctx.currentTime + delay;

  const source = ctx.createBufferSource();
  source.buffer = engine.noiseBuffer;
  source.loop = true;

  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.setValueAtTime(freq, start);
  if (freqTo !== null) biquad.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), start + duration);
  biquad.Q.value = q;

  const amp = ctx.createGain();
  envelope(ctx, amp, { start, attack, duration, peak: gain });

  source.connect(biquad).connect(amp).connect(engine.sfxBus);
  source.start(start);
  source.stop(start + duration + 0.05);
}

function tone(engine, options = {}) {
  const {
    freq = 220,
    freqTo = null,
    type = 'sine',
    duration = 0.3,
    gain = 0.3,
    attack = 0.005,
    delay = 0,
  } = options;

  const ctx = engine.ctx;
  const start = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), start + duration);

  const amp = ctx.createGain();
  envelope(ctx, amp, { start, attack, duration, peak: gain });

  osc.connect(amp).connect(engine.sfxBus);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

// Pancada grave genérica, base de quase todos os impactos.
function thud(engine, { gain = 0.5, freq = 90, duration = 0.32, delay = 0 } = {}) {
  tone(engine, { freq, freqTo: freq * 0.45, type: 'sine', duration, gain, delay });
  noise(engine, { duration: duration * 0.6, filter: 'lowpass', freq: 420, freqTo: 120, gain: gain * 0.5, delay });
}

function clang(engine, { gain = 0.25, freq = 1400, delay = 0 } = {}) {
  tone(engine, { freq, freqTo: freq * 0.7, type: 'triangle', duration: 0.5, gain, delay });
  tone(engine, { freq: freq * 1.48, freqTo: freq * 1.1, type: 'triangle', duration: 0.35, gain: gain * 0.6, delay });
  noise(engine, { duration: 0.12, filter: 'highpass', freq: 2600, gain: gain * 0.5, delay });
}

const ATTACKS = {
  // Peão: pancada seca de escudo.
  p: (e) => {
    noise(e, { duration: 0.14, filter: 'bandpass', freq: 1100, q: 2.5, gain: 0.45 });
    thud(e, { gain: 0.35, freq: 130, duration: 0.2 });
    clang(e, { gain: 0.12, freq: 900 });
  },
  // Torre: aríete de pedra, grave e demorado.
  r: (e) => {
    noise(e, { duration: 0.42, filter: 'lowpass', freq: 260, freqTo: 90, gain: 0.4 });
    thud(e, { gain: 0.75, freq: 70, duration: 0.6, delay: 0.22 });
    noise(e, { duration: 0.35, filter: 'lowpass', freq: 800, freqTo: 200, gain: 0.3, delay: 0.22 });
  },
  // Cavalo: galope e pisoteio.
  n: (e) => {
    thud(e, { gain: 0.22, freq: 150, duration: 0.14 });
    thud(e, { gain: 0.18, freq: 130, duration: 0.14, delay: 0.1 });
    noise(e, { duration: 0.4, filter: 'bandpass', freq: 500, freqTo: 1600, q: 0.8, gain: 0.18, delay: 0.16 });
    thud(e, { gain: 0.34, freq: 85, duration: 0.45, delay: 0.5 });
  },
  // Bispo: descarga arcana.
  b: (e) => {
    tone(e, { freq: 1500, freqTo: 180, type: 'sawtooth', duration: 0.45, gain: 0.18 });
    tone(e, { freq: 760, freqTo: 120, type: 'square', duration: 0.4, gain: 0.1, delay: 0.02 });
    noise(e, { duration: 0.5, filter: 'bandpass', freq: 2400, freqTo: 600, q: 3, gain: 0.25 });
    tone(e, { freq: 90, freqTo: 55, type: 'sine', duration: 0.5, gain: 0.3, delay: 0.1 });
  },
  // Rainha: rodopio cortante.
  q: (e) => {
    noise(e, { duration: 0.5, filter: 'bandpass', freq: 380, freqTo: 2200, q: 1.4, gain: 0.3 });
    noise(e, { duration: 0.3, filter: 'bandpass', freq: 1800, freqTo: 500, q: 2, gain: 0.22, delay: 0.3 });
    clang(e, { gain: 0.22, freq: 1700, delay: 0.42 });
  },
  // Rei: investida pesada.
  k: (e) => {
    noise(e, { duration: 0.5, filter: 'lowpass', freq: 180, freqTo: 70, gain: 0.2 });
    tone(e, { freq: 62, freqTo: 40, type: 'sine', duration: 0.7, gain: 0.18 });
    thud(e, { gain: 0.4, freq: 60, duration: 0.75, delay: 0.5 });
    clang(e, { gain: 0.15, freq: 700, delay: 0.5 });
  },
};

const DEATHS = {
  // Peão: corpo no chão e escudo tinindo.
  p: (e) => {
    thud(e, { gain: 0.42, freq: 110, duration: 0.3 });
    clang(e, { gain: 0.16, freq: 1250, delay: 0.24 });
    clang(e, { gain: 0.1, freq: 980, delay: 0.42 });
  },
  // Torre: desmoronamento longo de pedra.
  r: (e) => {
    thud(e, { gain: 0.6, freq: 65, duration: 0.7 });
    for (let i = 0; i < 7; i++) {
      noise(e, {
        duration: 0.1 + Math.random() * 0.12,
        filter: 'lowpass',
        freq: 700 + Math.random() * 900,
        freqTo: 200,
        gain: 0.16 + Math.random() * 0.12,
        delay: 0.12 + i * 0.09 + Math.random() * 0.05,
      });
    }
    noise(e, { duration: 0.9, filter: 'lowpass', freq: 300, freqTo: 120, gain: 0.18, delay: 0.1 });
  },
  // Cavalo: tombo pesado e poeira.
  n: (e) => {
    thud(e, { gain: 0.6, freq: 78, duration: 0.5, delay: 0.3 });
    noise(e, { duration: 0.7, filter: 'lowpass', freq: 900, freqTo: 180, gain: 0.22, delay: 0.32 });
  },
  // Bispo: cajado partindo e magia se dissipando.
  b: (e) => {
    noise(e, { duration: 0.08, filter: 'highpass', freq: 2800, gain: 0.4 });
    clang(e, { gain: 0.2, freq: 1900, delay: 0.02 });
    tone(e, { freq: 620, freqTo: 70, type: 'sine', duration: 0.9, gain: 0.16, delay: 0.1 });
    clang(e, { gain: 0.12, freq: 1100, delay: 0.55 });
  },
  // Rainha: coroa batendo e rolando.
  q: (e) => {
    thud(e, { gain: 0.4, freq: 95, duration: 0.35 });
    clang(e, { gain: 0.3, freq: 1600, delay: 0.18 });
    clang(e, { gain: 0.2, freq: 1450, delay: 0.42 });
    clang(e, { gain: 0.13, freq: 1520, delay: 0.62 });
    clang(e, { gain: 0.08, freq: 1580, delay: 0.78 });
  },
  // Rei: queda solene.
  k: (e) => {
    thud(e, { gain: 0.5, freq: 70, duration: 0.6, delay: 0.35 });
    tone(e, { freq: 110, freqTo: 55, type: 'triangle', duration: 1.6, gain: 0.2, delay: 0.4 });
    tone(e, { freq: 55, freqTo: 41, type: 'sine', duration: 2, gain: 0.22, delay: 0.4 });
  },
};

const STEPS = {
  // Passo leve de soldado.
  p: (e) => {
    noise(e, { duration: 0.1, filter: 'bandpass', freq: 900, q: 1.2, gain: 0.16 });
    thud(e, { gain: 0.12, freq: 150, duration: 0.12 });
  },
  // Pedra arrastando.
  r: (e) => {
    noise(e, { duration: 0.35, filter: 'lowpass', freq: 500, freqTo: 180, gain: 0.2 });
    thud(e, { gain: 0.22, freq: 80, duration: 0.25, delay: 0.24 });
  },
  // Galope de dois tempos.
  n: (e) => {
    thud(e, { gain: 0.18, freq: 160, duration: 0.12 });
    thud(e, { gain: 0.15, freq: 140, duration: 0.12, delay: 0.11 });
    thud(e, { gain: 0.16, freq: 150, duration: 0.12, delay: 0.24 });
  },
  // O bispo flutua: quase só ar.
  b: (e) => {
    noise(e, { duration: 0.4, filter: 'bandpass', freq: 600, freqTo: 1500, q: 0.7, gain: 0.1 });
    tone(e, { freq: 480, freqTo: 900, type: 'sine', duration: 0.35, gain: 0.05 });
  },
  // Passo com roçar de vestes.
  q: (e) => {
    noise(e, { duration: 0.3, filter: 'bandpass', freq: 1400, freqTo: 700, q: 1, gain: 0.12 });
    thud(e, { gain: 0.13, freq: 130, duration: 0.15, delay: 0.12 });
  },
  // Passo pesado e duplo.
  k: (e) => {
    thud(e, { gain: 0.26, freq: 90, duration: 0.25 });
    thud(e, { gain: 0.2, freq: 85, duration: 0.25, delay: 0.2 });
    noise(e, { duration: 0.2, filter: 'lowpass', freq: 400, gain: 0.1, delay: 0.2 });
  },
};

export function createSfx(engine) {
  function play(bank, prefix, type, sampleOptions) {
    if (!engine.ready) return;
    if (engine.playSample(`${prefix}_${type}`, sampleOptions)) return;
    bank[type]?.(engine);
  }

  return {
    playAttack: (type) => play(ATTACKS, 'attack', type),
    playDeath: (type) => play(DEATHS, 'death', type),
    playStep: (type) => play(STEPS, 'step', type),
    playUi(kind) {
      if (!engine.ready) return;
      if (engine.playSample(`ui_${kind}`)) return;
      if (kind === 'check') {
        tone(engine, { freq: 320, freqTo: 180, type: 'triangle', duration: 0.8, gain: 0.18 });
        tone(engine, { freq: 160, freqTo: 120, type: 'sine', duration: 1, gain: 0.16 });
      } else if (kind === 'victory') {
        tone(engine, { freq: 196, type: 'triangle', duration: 1.6, gain: 0.2 });
        tone(engine, { freq: 294, type: 'triangle', duration: 1.6, gain: 0.14, delay: 0.12 });
        tone(engine, { freq: 98, type: 'sine', duration: 2.2, gain: 0.2 });
      } else {
        noise(engine, { duration: 0.12, filter: 'bandpass', freq: 1600, q: 2, gain: 0.12 });
      }
    },
  };
}
