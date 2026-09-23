import { noise, tone } from './sfx.js';

// Camada de áudio ambiente do campo de batalha, separada da trilha musical:
// vento, fogueira crepitando, corvos ao longe, chuva e trovão. O perfil de
// cada clima define quanto de cada coisa toca.
const PROFILES = {
  neve: { wind: 0.45, windFreq: 380, hiss: 0.5, fire: 0.9, crows: 0.6, rain: 0, sand: 0 },
  limpo: { wind: 0.3, windFreq: 520, hiss: 0, fire: 0.6, crows: 1, rain: 0, sand: 0 },
  neblina: { wind: 0.15, windFreq: 300, hiss: 0, fire: 0.7, crows: 0.8, rain: 0, sand: 0 },
  tempestade: { wind: 0.9, windFreq: 460, hiss: 0, fire: 0.5, crows: 0.2, rain: 1, sand: 0 },
  areia: { wind: 1, windFreq: 850, hiss: 0, fire: 0.45, crows: 0.25, rain: 0, sand: 1 },
};

export function createAmbience(engine) {
  let nodes = null;
  let profile = PROFILES.neve;
  let battle = 0; // 0..1: destruição acumulada (mais fogo crepitando)
  const timers = new Set();

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
    source.loopStart = Math.random();
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
    if (!nodes || profile.crows <= 0) return;
    later((7 + Math.random() * 12) * 1000 / Math.max(0.3, profile.crows), () => {
      if (!nodes) return;
      nodes.crowPan.pan.value = Math.random() * 1.6 - 0.8;
      const calls = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < calls; i++) caw(i * (0.32 + Math.random() * 0.12));
      scheduleCrows();
    });
  }

  // Estalos da fogueira: estalidos curtos e irregulares.
  function scheduleCrackle() {
    if (!nodes) return;
    const density = profile.fire * (0.6 + battle * 1.4);
    later(60 + Math.random() * 380 / Math.max(0.2, density), () => {
      if (!nodes) return;
      noise(engine, {
        duration: 0.008 + Math.random() * 0.02,
        filter: 'bandpass',
        freq: 1800 + Math.random() * 3500,
        q: 1.5,
        gain: (0.03 + Math.random() * 0.05) * profile.fire,
        attack: 0.001,
        out: nodes.bus,
      });
      scheduleCrackle();
    });
  }

  function start(weatherId) {
    const ctx = engine.ctx;
    if (!ctx || nodes) return;
    profile = PROFILES[weatherId] ?? PROFILES.neve;

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

    // Neve: um sussurro agudo quase inaudível, o "silêncio" da neve caindo.
    if (profile.hiss) layers.push(loopNoise(ctx, bus, { type: 'highpass', freq: 6500, gain: 0.008 * profile.hiss }));
    // Chuva pesada + ronco grave do temporal.
    if (profile.rain) {
      const rain = loopNoise(ctx, bus, { type: 'highpass', freq: 1300, gain: 0.07 * profile.rain });
      layers.push(rain, loopNoise(ctx, bus, { type: 'lowpass', freq: 260, gain: 0.05 * profile.rain }));
      lfos.push(lfo(ctx, rain.amp.gain, { rate: 0.2, depth: 0.015 }));
    }
    // Areia: chiado de grãos batendo, que acompanha as rajadas.
    if (profile.sand) {
      const grains = loopNoise(ctx, bus, { type: 'highpass', freq: 3200, gain: 0.04 * profile.sand });
      layers.push(grains);
      lfos.push(lfo(ctx, grains.amp.gain, { rate: 0.13, depth: 0.03 }));
    }
    // Fogueira: ronco grave constante.
    const fire = loopNoise(ctx, bus, { type: 'lowpass', freq: 220, gain: 0.035 * profile.fire });
    layers.push(fire);

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

    nodes = { bus, layers, lfos, fire, crowPan, crowEcho };
    bus.gain.setTargetAtTime(1, ctx.currentTime, 2);
    scheduleCrows();
    scheduleCrackle();
  }

  // Trovão: estalo (se perto) e um ronco longo que rola pelo vale.
  function thunder(power = 1, delay = 0) {
    const ctx = engine.ctx;
    if (!ctx || !nodes) return;
    const out = nodes.bus;
    if (power > 0.7) {
      noise(engine, { duration: 0.18, filter: 'highpass', freq: 1400, gain: 0.22 * power, delay, out });
    }
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

  // Destruição acumulada: o fogo cresce no som também.
  function setBattle(level) {
    battle = Math.min(1, Math.max(0, level));
    if (!nodes || !engine.ctx) return;
    nodes.fire.amp.gain.setTargetAtTime((0.035 + battle * 0.05) * profile.fire, engine.ctx.currentTime, 2);
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
      dying.bus.disconnect();
    }, 1600);
  }

  return { start, stop, thunder, setBattle };
}
