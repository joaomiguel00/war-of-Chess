// Efeitos sintetizados. Cada som é montado com ruído filtrado + osciladores,
// para não depender de nenhum arquivo externo. Se existir um sample com o
// mesmo id no manifesto, ele tem prioridade.

function envelope(ctx, node, { start, attack, duration, peak }) {
  node.gain.setValueAtTime(0.0001, start);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, start + duration);
}

export function noise(engine, options = {}) {
  const {
    duration = 0.2,
    filter = 'lowpass',
    freq = 900,
    freqTo = null,
    q = 1,
    gain = 0.4,
    attack = 0.005,
    delay = 0,
    out = engine.sfxBus,
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

  source.connect(biquad).connect(amp).connect(out);
  source.start(start);
  source.stop(start + duration + 0.05);
}

export function tone(engine, options = {}) {
  const {
    freq = 220,
    freqTo = null,
    type = 'sine',
    duration = 0.3,
    gain = 0.3,
    attack = 0.005,
    delay = 0,
    out = engine.sfxBus,
  } = options;

  const ctx = engine.ctx;
  const start = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), start + duration);

  const amp = ctx.createGain();
  envelope(ctx, amp, { start, attack, duration, peak: gain });

  osc.connect(amp).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

// Pancada grave genérica, base de quase todos os impactos.
export function thud(engine, { gain = 0.5, freq = 90, duration = 0.32, delay = 0, out } = {}) {
  tone(engine, { freq, freqTo: freq * 0.45, type: 'sine', duration, gain, delay, out });
  noise(engine, { duration: duration * 0.6, filter: 'lowpass', freq: 420, freqTo: 120, gain: gain * 0.5, delay, out });
}

export function clang(engine, { gain = 0.25, freq = 1400, delay = 0, duration = 0.5, out } = {}) {
  tone(engine, { freq, freqTo: freq * 0.7, type: 'triangle', duration, gain, delay, out });
  tone(engine, { freq: freq * 1.48, freqTo: freq * 1.1, type: 'triangle', duration: duration * 0.7, gain: gain * 0.6, delay, out });
  noise(engine, { duration: 0.12, filter: 'highpass', freq: 2600, gain: gain * 0.5, delay, out });
}

// Acorde sustentado (brilho mágico do impacto).
function chord(engine, freqs, { type = 'sine', duration = 1, gain = 0.08, attack = 0.005, delay = 0 } = {}) {
  freqs.forEach((freq, i) =>
    tone(engine, { freq, freqTo: freq * 0.985, type, duration: duration * (1 - i * 0.08), gain, attack, delay }),
  );
}

// Preparação do ataque: toca na largada (o golpe tem som próprio no impacto).
const WINDUPS = {
  // Peão: passinhos apressados.
  p: (e) => {
    [0, 0.1, 0.2].forEach((delay) => thud(e, { gain: 0.1, freq: 175, duration: 0.1, delay }));
    noise(e, { duration: 0.3, filter: 'bandpass', freq: 900, q: 1, gain: 0.05 });
  },
  // Cavalo: galope que acelera e o vento da carga.
  n: (e) => {
    [0, 0.13, 0.23, 0.31, 0.37].forEach((delay, i) =>
      thud(e, { gain: 0.13 + i * 0.03, freq: 150 - i * 8, duration: 0.12, delay }),
    );
    noise(e, { duration: 0.5, filter: 'bandpass', freq: 400, freqTo: 1900, q: 0.9, gain: 0.16, attack: 0.4 });
  },
  r: () => {},
  // Bispo: a gema carregando, um zumbido que sobe.
  b: (e) => {
    tone(e, { freq: 220, freqTo: 880, type: 'sine', duration: 0.42, gain: 0.1, attack: 0.36 });
    tone(e, { freq: 330, freqTo: 1320, type: 'triangle', duration: 0.42, gain: 0.05, attack: 0.36 });
    noise(e, { duration: 0.42, filter: 'highpass', freq: 5000, gain: 0.05, attack: 0.36 });
  },
  // Rainha: rodopio e o cetro carregando.
  q: (e) => {
    noise(e, { duration: 0.7, filter: 'bandpass', freq: 300, freqTo: 2200, q: 1.3, gain: 0.2, attack: 0.3, delay: 0.1 });
    tone(e, { freq: 180, freqTo: 520, type: 'sine', duration: 0.75, gain: 0.08, attack: 0.65, delay: 0.1 });
  },
  // Rei: o orbe acordando, grave e solene.
  k: (e) => {
    tone(e, { freq: 55, freqTo: 110, type: 'sawtooth', duration: 0.62, gain: 0.07, attack: 0.55 });
    tone(e, { freq: 110, freqTo: 220, type: 'sine', duration: 0.62, gain: 0.09, attack: 0.55 });
    noise(e, { duration: 0.62, filter: 'highpass', freq: 4500, gain: 0.04, attack: 0.55 });
  },
};

// Som do golpe: dispara no quadro exato do impacto.
const IMPACTS = {
  // Peão: impacto metálico curto e seco.
  p: (e) => {
    noise(e, { duration: 0.05, filter: 'highpass', freq: 3200, gain: 0.4 });
    clang(e, { gain: 0.2, freq: 1650, duration: 0.18 });
    thud(e, { gain: 0.22, freq: 160, duration: 0.12 });
  },
  // Escudada: baque abafado de madeira e metal.
  p_bash: (e) => {
    thud(e, { gain: 0.4, freq: 120, duration: 0.18 });
    noise(e, { duration: 0.08, filter: 'bandpass', freq: 650, q: 1.5, gain: 0.3 });
  },
  // Cavalo: lança estalando contra a armadura.
  n: (e) => {
    noise(e, { duration: 0.18, filter: 'bandpass', freq: 900, q: 1.2, gain: 0.45 });
    noise(e, { duration: 0.05, filter: 'highpass', freq: 2200, gain: 0.3 });
    thud(e, { gain: 0.5, freq: 80, duration: 0.4 });
  },
  // Torre: desabamento esmagador.
  r: (e) => {
    thud(e, { gain: 0.9, freq: 52, duration: 0.95 });
    noise(e, { duration: 0.75, filter: 'lowpass', freq: 900, freqTo: 150, gain: 0.45 });
    for (let i = 0; i < 6; i++) {
      noise(e, { duration: 0.08, filter: 'lowpass', freq: 1200, freqTo: 300, gain: 0.14, delay: 0.1 + i * 0.07 });
    }
  },
  // Bispo: descarga sagrada, brilhante.
  b: (e) => {
    chord(e, [880, 1320, 1760], { duration: 0.6, gain: 0.07 });
    noise(e, { duration: 0.14, filter: 'highpass', freq: 4000, gain: 0.25 });
    tone(e, { freq: 140, freqTo: 60, type: 'sine', duration: 0.4, gain: 0.25 });
  },
  // Rainha: estrondo e o brilho safira da explosão.
  q: (e) => {
    thud(e, { gain: 0.7, freq: 60, duration: 0.85 });
    chord(e, [440, 660, 990], { type: 'triangle', duration: 1.1, gain: 0.06 });
    noise(e, { duration: 0.6, filter: 'bandpass', freq: 2200, freqTo: 400, q: 1.2, gain: 0.3 });
  },
  // Rei: a espada desce pesada e o orbe estoura em ouro.
  k: (e) => {
    clang(e, { gain: 0.32, freq: 900, duration: 0.7 });
    thud(e, { gain: 0.85, freq: 48, duration: 1.1 });
    chord(e, [196, 294, 392, 588], { type: 'triangle', duration: 1.8, gain: 0.07 });
    noise(e, { duration: 0.2, filter: 'highpass', freq: 3500, gain: 0.25 });
  },
};

// Corneta de guerra: dois trompistas (fundamental e oitava abaixo), com
// ataque em "scoop", filtro que abre como metal e eco de vale.
function horn(engine, echo, { freq, delay, duration, gain }) {
  const ctx = engine.ctx;
  const start = ctx.currentTime + delay;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(260, start);
  filter.frequency.linearRampToValueAtTime(1700, start + 0.16);
  filter.frequency.linearRampToValueAtTime(1150, start + duration * 0.7);
  filter.frequency.linearRampToValueAtTime(420, start + duration);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.12);
  amp.gain.setValueAtTime(gain, start + duration - 0.3);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  filter.connect(amp);
  amp.connect(engine.sfxBus);
  amp.connect(echo);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.value = 7;
  vibrato.connect(depth);

  for (const detune of [-8, 8]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.93, start);
    osc.frequency.exponentialRampToValueAtTime(freq, start + 0.12);
    osc.detune.value = detune;
    depth.connect(osc.detune);
    osc.connect(filter);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
  vibrato.start(start);
  vibrato.stop(start + duration + 0.05);
}

function warHorn(engine) {
  const ctx = engine.ctx;
  // Eco de vale: atraso com realimentação e agudos abafados.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.21;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1400;
  echo.connect(damp).connect(feedback).connect(echo);
  damp.connect(engine.sfxBus);
  setTimeout(() => damp.disconnect(), 5000);

  horn(engine, echo, { freq: 110, delay: 0, duration: 1.1, gain: 0.2 });
  horn(engine, echo, { freq: 55, delay: 0, duration: 1.1, gain: 0.12 });
  horn(engine, echo, { freq: 146.8, delay: 1.0, duration: 1.5, gain: 0.22 });
  horn(engine, echo, { freq: 73.4, delay: 1.0, duration: 1.5, gain: 0.12 });

  // Tambores de guerra por baixo.
  [0, 0.5, 0.95, 1.3, 1.42, 1.54, 1.66, 2.0].forEach((delay, i) =>
    thud(engine, { gain: i === 7 || i === 0 ? 0.7 : 0.4, freq: i === 7 ? 50 : 68, duration: 0.55, delay }),
  );
}

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

// Arauto: um sopro de ar ("whoosh") e uma nota curta junto do texto.
function whoosh(engine, { gain = 0.14, duration = 0.5 } = {}) {
  noise(engine, { duration, filter: 'bandpass', freq: 300, freqTo: 2600, q: 1.1, gain, attack: duration * 0.55 });
}

const HERALD = {
  capture: (e) => {
    whoosh(e, { gain: 0.1, duration: 0.42 });
    tone(e, { freq: 392, type: 'triangle', duration: 0.6, gain: 0.06, attack: 0.02, delay: 0.22 });
  },
  major: (e) => {
    whoosh(e, { gain: 0.16, duration: 0.55 });
    [196, 294, 392].forEach((freq, i) =>
      tone(e, { freq, type: 'triangle', duration: 1.3, gain: 0.07 - i * 0.012, attack: 0.03, delay: 0.3 }),
    );
    thud(e, { gain: 0.25, freq: 60, duration: 0.8, delay: 0.3 });
  },
  check: (e) => {
    whoosh(e, { gain: 0.14, duration: 0.4 });
    tone(e, { freq: 233, type: 'sawtooth', duration: 0.5, gain: 0.05, attack: 0.02, delay: 0.2 });
    tone(e, { freq: 247, type: 'sawtooth', duration: 0.5, gain: 0.04, attack: 0.02, delay: 0.2 });
  },
  danger: (e) => {
    whoosh(e, { gain: 0.12, duration: 0.6 });
    tone(e, { freq: 110, freqTo: 104, type: 'sawtooth', duration: 1.4, gain: 0.07, attack: 0.3, delay: 0.25 });
    tone(e, { freq: 155, freqTo: 147, type: 'triangle', duration: 1.4, gain: 0.05, attack: 0.3, delay: 0.25 });
  },
  mate: (e) => {
    whoosh(e, { gain: 0.2, duration: 0.7 });
    thud(e, { gain: 0.6, freq: 45, duration: 1.6, delay: 0.3 });
    [98, 147, 196, 294].forEach((freq, i) =>
      tone(e, { freq, type: 'triangle', duration: 2.4, gain: 0.08 - i * 0.012, attack: 0.05, delay: 0.3 }),
    );
  },
};

export function createSfx(engine) {
  function play(bank, prefix, type, sampleOptions) {
    if (!engine.ready) return;
    if (engine.playSample(`${prefix}_${type}`, sampleOptions)) return;
    bank[type]?.(engine);
  }

  return {
    playWindup: (type) => play(WINDUPS, 'windup', type),
    // Arquivo de ataque (attack_*) toca a partir do pico, alinhado ao golpe.
    playImpact: (type) => play(IMPACTS, 'attack', type, { fromPeak: true }),
    playDeath: (type) => play(DEATHS, 'death', type),
    playStep: (type) => play(STEPS, 'step', type),
    playHerald(kind) {
      if (!engine.ready) return;
      if (engine.playSample(`herald_${kind}`)) return;
      HERALD[kind]?.(engine);
    },
    playWarHorn() {
      if (!engine.ready) return;
      if (engine.playSample('warhorn')) return;
      warHorn(engine);
    },
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
