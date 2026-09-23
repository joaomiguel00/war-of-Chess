import { noise, thud, tone } from './sfx.js';

// Sons de tensão: o batimento cardíaco no xeque e o exército marchando
// enquanto o adversário pensa. Tudo passa pelo barramento de efeitos, então
// respeita volume/mudo (e o abafamento do zumbido).

export function createHeartbeat(engine) {
  let timer = null;
  let bpm = 80;
  let running = false;
  const listeners = new Set();

  function beat() {
    if (!running || !engine.ready) return;
    // "Tum-tum": duas batidas graves, a segunda mais fraca.
    thud(engine, { gain: 0.42, freq: 58, duration: 0.16 });
    thud(engine, { gain: 0.3, freq: 50, duration: 0.18, delay: 0.17 });
    listeners.forEach((fn) => fn(bpm));
    timer = setTimeout(beat, 60000 / bpm);
  }

  // escapes: casas de fuga do rei. Menos saída = coração mais acelerado.
  function start(escapes) {
    bpm = escapes <= 0 ? 150 : escapes === 1 ? 128 : escapes === 2 ? 108 : 88;
    if (running) return;
    running = true;
    beat();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
  }

  return { start, stop, onBeat: (fn) => (listeners.add(fn), () => listeners.delete(fn)), get running() { return running; } };
}

// Tambores e passos abafados, crescendo quanto mais o adversário demora.
export function createMarch(engine) {
  let timer = null;
  let startedAt = 0;
  let beatIndex = 0;
  let bus = null;
  let filter = null;

  function ensureBus() {
    const ctx = engine.ctx;
    if (!ctx || bus) return;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    bus = ctx.createGain();
    bus.gain.value = 0;
    filter.connect(bus).connect(engine.sfxBus);
  }

  function tick() {
    const ctx = engine.ctx;
    if (!ctx || !bus) return;
    const waited = (performance.now() - startedAt) / 1000;
    // Começa quase inaudível e cresce até ~25 s de espera.
    const level = Math.min(1, Math.max(0, (waited - 2.5) / 22));
    bus.gain.setTargetAtTime(level * 0.55, ctx.currentTime, 0.4);
    // Passo de cada soldado (esquerda, direita) e tambor a cada dois passos.
    noise(engine, { duration: 0.09, filter: 'lowpass', freq: 700, gain: 0.35, out: filter });
    noise(engine, { duration: 0.07, filter: 'lowpass', freq: 500, gain: 0.25, delay: 0.04, out: filter });
    if (beatIndex % 2 === 0) thud(engine, { gain: 0.5, freq: 72, duration: 0.35, out: filter });
    if (beatIndex % 8 === 6) tone(engine, { freq: 110, type: 'triangle', duration: 0.25, gain: 0.08, out: filter });
    beatIndex++;
    timer = setTimeout(tick, 545);
  }

  function start() {
    if (!engine.ready) return;
    ensureBus();
    stopTimer();
    startedAt = performance.now();
    beatIndex = 0;
    timer = setTimeout(tick, 400);
  }

  function stopTimer() {
    clearTimeout(timer);
    timer = null;
  }

  function stop() {
    stopTimer();
    if (bus && engine.ctx) bus.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.25);
  }

  return { start, stop };
}
