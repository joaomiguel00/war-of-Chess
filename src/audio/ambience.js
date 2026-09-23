import { noise, tone, thud } from './sfx.js';

// Camada de áudio ambiente do campo de batalha, separada da trilha musical:
// vento, fogueiras crepitando, corvos ao longe, chuva e trovão. O perfil do
// clima define quanto de cada coisa toca; o tema soma uma camada própria
// (assobio do deserto, uivo da montanha, ronco do vulcão). Cada exército tem
// o seu lado no estéreo: quem perde peças ouve menos fogo e mais vento.
const PROFILES = {
  neve: { wind: 0.45, windFreq: 380, hiss: 0.5, fire: 0.9, crows: 0.6, rain: 0, sand: 0 },
  limpo: { wind: 0.3, windFreq: 520, hiss: 0, fire: 0.6, crows: 1, rain: 0, sand: 0 },
  neblina: { wind: 0.15, windFreq: 300, hiss: 0, fire: 0.7, crows: 0.8, rain: 0, sand: 0 },
  tempestade: { wind: 0.9, windFreq: 460, hiss: 0, fire: 0.5, crows: 0.2, rain: 1, sand: 0 },
  areia: { wind: 1, windFreq: 850, hiss: 0, fire: 0.45, crows: 0.25, rain: 0, sand: 1 },
};

const THEME_LAYERS = {
  forest: { crows: 1 },
  desert: { crows: 0.35, whistle: 1 },
  mountain: { crows: 0.5, howl: 1 },
  volcano: { crows: 0.2, rumble: 1 },
};

export function createAmbience(engine) {
  let nodes = null;
  let profile = PROFILES.neve;
  let themeLayer = THEME_LAYERS.forest;
  let battle = 0; // 0..1: destruição acumulada (mais fogo crepitando)
  const timers = new Set();
  // Moral de cada lado (1 = inteiro) e posição no estéreo (-1 esquerda, 1 direita).
  const sides = { w: { morale: 1, pan: 0 }, b: { morale: 1, pan: 0 } };

  function later(ms, fn) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function loopNoise(ctx, out, { type, freq, q = 0.7, gain }) {
    const source = ctx.createBufferSource();
    source.buffer = engine.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    source.connect(filter).connect(amp).connect(out);
    source.start(0, Math.random() * 1.5);
    return { source, filter, amp };
  }

  function lfo(ctx, target, { rate, depth }) {
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = depth;
    osc.connect(gain).connect(target);
    osc.start();
    return osc;
  }

  // Corvo distante: dente-de-serra por dois formantes, com eco e panorâmica.
  function caw(delay) {
    const ctx = engine.ctx;
    if (!ctx || !nodes) return;
    const start = ctx.currentTime + delay;
    const pitch = 480 + Math.random() * 160;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch * 1.15, start);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.82, start + 0.24);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 1150;
    f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 2400;
    f2.Q.value = 5;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(0.09 * profile.crows, start + 0.025);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.27);
    osc.connect(f1).connect(amp);
    osc.connect(f2).connect(amp);
    amp.connect(nodes.crowPan);
    osc.start(start);
    osc.stop(start + 0.3);
  }

  function scheduleCrows() {
    const rate = profile.crows * themeLayer.crows;
    if (!nodes || rate <= 0.05) return;
    later(((7 + Math.random() * 12) * 1000) / Math.max(0.3, rate), () => {
      if (!nodes) return;
      nodes.crowPan.pan.value = Math.random() * 1.6 - 0.8;
      const calls = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < calls; i++) caw(i * (0.32 + Math.random() * 0.12));
      scheduleCrows();
    });
  }

  // Estalos das fogueiras de um lado: quanto menor a moral, mais raros.
  function scheduleCrackle(sideId) {
    if (!nodes) return;
    const side = nodes.sides[sideId];
    const morale = sides[sideId].morale;
    const density = profile.fire * (0.6 + battle * 1.4) * (0.15 + 0.85 * morale);
    later(80 + (Math.random() * 520) / Math.max(0.1, density), () => {
      if (!nodes) return;
      noise(engine, {
        duration: 0.008 + Math.random() * 0.02,
        filter: 'bandpass',
        freq: 1800 + Math.random() * 3500,
        q: 1.5,
        gain: (0.03 + Math.random() * 0.05) * profile.fire,
        attack: 0.001,
        out: side.pan,
      });
      scheduleCrackle(sideId);
    });
  }

  // Estrondos distantes do vulcão.
  function scheduleRumble() {
    if (!nodes || !themeLayer.rumble) return;
    later(9000 + Math.random() * 14000, () => {
      if (!nodes) return;
      thud(engine, { gain: 0.35, freq: 38, duration: 2.2, out: nodes.bus });
      noise(engine, { duration: 2.5, filter: 'lowpass', freq: 160, freqTo: 60, gain: 0.18, attack: 0.3, out: nodes.bus });
      scheduleRumble();
    });
  }

  function buildSide(ctx, bus) {
    const pan = ctx.createStereoPanner();
    pan.connect(bus);
    // Fogueira: ronco grave constante. Desolação: vento oco que sobe quando a moral cai.
    const fire = loopNoise(ctx, pan, { type: 'lowpass', freq: 220, gain: 0.03 * profile.fire });
    const desolate = loopNoise(ctx, pan, { type: 'bandpass', freq: 330, q: 4, gain: 0 });
    const sway = lfo(ctx, desolate.filter.frequency, { rate: 0.09 + Math.random() * 0.05, depth: 120 });
    return { pan, fire, desolate, sway };
  }

  function start(weatherId, themeId = 'forest') {
    const ctx = engine.ctx;
    if (!ctx || nodes) return;
    profile = PROFILES[weatherId] ?? PROFILES.neve;
    themeLayer = THEME_LAYERS[themeId] ?? THEME_LAYERS.forest;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(engine.ambienceBus);

    // Vento: ruído com filtro passa-banda que respira (rajadas).
    const wind = loopNoise(ctx, bus, { type: 'bandpass', freq: profile.windFreq, q: 0.8, gain: 0.03 + profile.wind * 0.1 });
    const lfos = [
      lfo(ctx, wind.filter.frequency, { rate: 0.07 + Math.random() * 0.04, depth: profile.windFreq * 0.55 }),
      lfo(ctx, wind.amp.gain, { rate: 0.11 + Math.random() * 0.05, depth: 0.02 + profile.wind * 0.06 }),
    ];
    const layers = [wind];

    if (profile.hiss) layers.push(loopNoise(ctx, bus, { type: 'highpass', freq: 6500, gain: 0.008 * profile.hiss }));
    if (profile.rain) {
      const rain = loopNoise(ctx, bus, { type: 'highpass', freq: 1300, gain: 0.07 * profile.rain });
      layers.push(rain, loopNoise(ctx, bus, { type: 'lowpass', freq: 260, gain: 0.05 * profile.rain }));
      lfos.push(lfo(ctx, rain.amp.gain, { rate: 0.2, depth: 0.015 }));
    }
    if (profile.sand) {
      const grains = loopNoise(ctx, bus, { type: 'highpass', freq: 3200, gain: 0.04 * profile.sand });
      layers.push(grains);
      lfos.push(lfo(ctx, grains.amp.gain, { rate: 0.13, depth: 0.03 }));
    }

    // Camada do tema.
    if (themeLayer.whistle) {
      const whistle = loopNoise(ctx, bus, { type: 'bandpass', freq: 1900, q: 9, gain: 0.03 });
      layers.push(whistle);
      lfos.push(lfo(ctx, whistle.filter.frequency, { rate: 0.12, depth: 500 }), lfo(ctx, whistle.amp.gain, { rate: 0.17, depth: 0.025 }));
    }
    if (themeLayer.howl) {
      const howl = loopNoise(ctx, bus, { type: 'bandpass', freq: 280, q: 7, gain: 0.05 });
      layers.push(howl);
      lfos.push(lfo(ctx, howl.filter.frequency, { rate: 0.06, depth: 110 }), lfo(ctx, howl.amp.gain, { rate: 0.09, depth: 0.04 }));
    }
    if (themeLayer.rumble) {
      layers.push(loopNoise(ctx, bus, { type: 'lowpass', freq: 70, gain: 0.09 }));
      layers.push(loopNoise(ctx, bus, { type: 'highpass', freq: 4200, gain: 0.006 }));
    }

    // Corvos distantes com eco.
    const crowPan = ctx.createStereoPanner();
    const crowEcho = ctx.createDelay(1);
    crowEcho.delayTime.value = 0.27;
    const crowFeedback = ctx.createGain();
    crowFeedback.gain.value = 0.28;
    const crowFar = ctx.createBiquadFilter();
    crowFar.type = 'lowpass';
    crowFar.frequency.value = 2600;
    crowPan.connect(crowFar).connect(bus);
    crowFar.connect(crowEcho).connect(crowFeedback).connect(crowEcho);
    crowFeedback.connect(bus);

    nodes = { bus, layers, lfos, crowPan, crowEcho, sides: { w: buildSide(ctx, bus), b: buildSide(ctx, bus) } };
    applySides();
    bus.gain.setTargetAtTime(1, ctx.currentTime, 2);
    scheduleCrows();
    scheduleCrackle('w');
    scheduleCrackle('b');
    scheduleRumble();
  }

  function applySides() {
    if (!nodes || !engine.ctx) return;
    const now = engine.ctx.currentTime;
    for (const id of ['w', 'b']) {
      const side = nodes.sides[id];
      const morale = sides[id].morale;
      side.fire.amp.gain.setTargetAtTime((0.018 + battle * 0.03) * profile.fire * (0.2 + 0.8 * morale), now, 2);
      side.desolate.amp.gain.setTargetAtTime((1 - morale) * 0.06, now, 2.5);
      side.pan.pan.setTargetAtTime(sides[id].pan, now, 0.3);
    }
  }

  // Trovão: estalo (se perto) e um ronco longo que rola pelo vale.
  function thunder(power = 1, delay = 0) {
    const ctx = engine.ctx;
    if (!ctx || !nodes) return;
    const out = nodes.bus;
    if (power > 0.7) noise(engine, { duration: 0.18, filter: 'highpass', freq: 1400, gain: 0.22 * power, delay, out });
    noise(engine, { duration: 3.4, filter: 'lowpass', freq: 380, freqTo: 70, gain: 0.34 * power, attack: 0.09, delay, out });
    for (let i = 0; i < 3; i++) {
      noise(engine, {
        duration: 1.2 + Math.random(),
        filter: 'lowpass',
        freq: 160 + Math.random() * 120,
        gain: 0.16 * power,
        attack: 0.2,
        delay: delay + 0.4 + i * (0.4 + Math.random() * 0.5),
        out,
      });
    }
    tone(engine, { freq: 42, freqTo: 30, type: 'sine', duration: 2.4, gain: 0.18 * power, attack: 0.1, delay, out });
  }

  // Rajada de vento repentina (eventos perto do rei ameaçado).
  function gust() {
    if (!nodes) return;
    noise(engine, { duration: 1.6, filter: 'bandpass', freq: 250, freqTo: 1400, q: 1.2, gain: 0.16, attack: 0.5, out: nodes.bus });
    noise(engine, { duration: 1.2, filter: 'highpass', freq: 2500, gain: 0.03, attack: 0.4, delay: 0.2, out: nodes.bus });
  }

  function setBattle(level) {
    battle = Math.min(1, Math.max(0, level));
    applySides();
  }

  function setSideMorale({ w, b }) {
    sides.w.morale = w;
    sides.b.morale = b;
    applySides();
  }

  // Direção de cada acampamento em relação à câmera (-1 esquerda .. 1 direita).
  function setSidePan({ w, b }) {
    if (Math.abs(sides.w.pan - w) < 0.02 && Math.abs(sides.b.pan - b) < 0.02) return;
    sides.w.pan = w;
    sides.b.pan = b;
    applySides();
  }

  function stop() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    if (!nodes || !engine.ctx) {
      nodes = null;
      return;
    }
    const dying = nodes;
    nodes = null;
    dying.bus.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.4);
    setTimeout(() => {
      dying.layers.forEach((layer) => layer.source.stop());
      dying.lfos.forEach((osc) => osc.stop());
      for (const side of Object.values(dying.sides)) {
        side.fire.source.stop();
        side.desolate.source.stop();
        side.sway.stop();
      }
      dying.bus.disconnect();
    }, 1600);
  }

  return { start, stop, thunder, gust, setBattle, setSideMorale, setSidePan };
}
