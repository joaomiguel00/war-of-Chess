// Trilha ambiente procedural: um bordão grave, tambores de guerra lentos e
// uma camada de chuva. A intensidade acompanha o clima da partida.
const ROOT = 73.42; // ré2

export function createMusic(engine) {
  let nodes = null;
  let drumTimer = null;
  let intensity = 0;
  let rainLevel = 0;
  let phase = 'calm'; // calm | tense | epic

  function drum() {
    const ctx = engine.ctx;
    if (!ctx || !nodes) return;
    const now = ctx.currentTime;
    const gain = 0.25 + intensity * 0.35;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(78, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.4);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc.connect(amp).connect(nodes.bus);
    osc.start(now);
    osc.stop(now + 0.6);

    const skin = ctx.createBufferSource();
    skin.buffer = engine.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    const skinAmp = ctx.createGain();
    skinAmp.gain.setValueAtTime(0.0001, now);
    skinAmp.gain.exponentialRampToValueAtTime(gain * 0.5, now + 0.008);
    skinAmp.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    skin.connect(filter).connect(skinAmp).connect(nodes.bus);
    skin.start(now);
    skin.stop(now + 0.3);

    scheduleDrum();
  }

  function scheduleDrum() {
    clearTimeout(drumTimer);
    // Quanto pior a situação, mais apertado o compasso; na fase épica os
    // tambores aceleram de vez.
    const epic = phase === 'epic' ? 700 : 0;
    const interval = 2800 - intensity * 900 - epic + (Math.random() - 0.5) * 200;
    drumTimer = setTimeout(drum, Math.max(500, interval));
  }

  // Com um arquivo em "music_loop", ele toca no lugar do bordão sintetizado.
  function startFromSample(buffer) {
    const ctx = engine.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(engine.musicBus);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 12000;
    filter.connect(bus);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(filter);
    source.start();

    const rain = ctx.createBufferSource();
    rain.buffer = engine.noiseBuffer;
    rain.loop = true;
    const rainHigh = ctx.createBiquadFilter();
    rainHigh.type = 'highpass';
    rainHigh.frequency.value = 1400;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(rainHigh).connect(rainGain).connect(bus);
    rain.start();

    nodes = { bus, voices: [], source, rain, rainGain, droneFilter: filter, fromSample: true };
    bus.gain.setTargetAtTime(1, ctx.currentTime, 2.5);
  }

  function start() {
    const ctx = engine.ctx;
    if (!ctx || nodes) return;

    const sample = engine.getSample?.('music_loop');
    if (sample) {
      startFromSample(sample);
      return;
    }

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(engine.musicBus);

    // Bordão: quinta aberta com uma voz desafinada por cima.
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 420;
    droneFilter.Q.value = 3;
    droneFilter.connect(bus);

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.16;
    droneGain.connect(droneFilter);

    const voices = [ROOT, ROOT * 1.5, ROOT * 2.002, ROOT * 0.5].map((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 3 ? 'sine' : 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = (index - 1.5) * 6;
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = index === 3 ? 0.5 : 0.22;
      osc.connect(voiceGain).connect(droneGain);
      osc.start();
      return { osc, gain: voiceGain };
    });

    // Voz dissonante que só entra quando a partida azeda.
    const tension = ctx.createOscillator();
    tension.type = 'sawtooth';
    tension.frequency.value = ROOT * 1.414;
    const tensionGain = ctx.createGain();
    tensionGain.gain.value = 0;
    tension.connect(tensionGain).connect(droneGain);
    tension.start();

    // Respiração lenta do filtro, para o bordão não ficar estático.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(droneFilter.frequency);
    lfo.start();

    // Camada épica: vozes uma oitava acima, brilhantes, que só entram na fase
    // final da partida (crossfade pelo epicGain).
    const epicGain = ctx.createGain();
    epicGain.gain.value = 0;
    epicGain.connect(bus);
    const epicFilter = ctx.createBiquadFilter();
    epicFilter.type = 'lowpass';
    epicFilter.frequency.value = 2400;
    epicFilter.connect(epicGain);
    const epicVoices = [ROOT * 2, ROOT * 3, ROOT * 4.004].map((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = (index - 1) * 7;
      const g = ctx.createGain();
      g.gain.value = index === 0 ? 0.18 : 0.1;
      osc.connect(g).connect(epicFilter);
      osc.start();
      return osc;
    });

    // Chuva: ruído filtrado em loop, silencioso até o clima virar.
    const rain = ctx.createBufferSource();
    rain.buffer = engine.noiseBuffer;
    rain.loop = true;
    const rainHigh = ctx.createBiquadFilter();
    rainHigh.type = 'highpass';
    rainHigh.frequency.value = 1400;
    const rainLow = ctx.createBiquadFilter();
    rainLow.type = 'lowpass';
    rainLow.frequency.value = 6000;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(rainHigh).connect(rainLow).connect(rainGain).connect(bus);
    rain.start();

    nodes = { bus, voices, tension, tensionGain, lfo, rain, rainGain, droneFilter, epicGain, epicVoices };

    bus.gain.setTargetAtTime(1, ctx.currentTime, 2.5); // entrada suave
    scheduleDrum();
  }

  function setIntensity(value) {
    intensity = Math.min(1, Math.max(0, value));
    if (!nodes || !engine.ctx) return;
    const now = engine.ctx.currentTime;
    if (nodes.fromSample) {
      // Sobre um arquivo, o clima vira abafamento progressivo.
      nodes.droneFilter.frequency.setTargetAtTime(12000 - intensity * 9000, now, 3);
      return;
    }
    nodes.tensionGain.gain.setTargetAtTime(intensity * 0.12, now, 3);
    nodes.droneFilter.frequency.setTargetAtTime(420 - intensity * 190, now, 3);
  }

  // Xeque: a trilha fecha o filtro e sobe a voz dissonante.
  function setAlert(on) {
    if (!nodes || !engine.ctx) return;
    const now = engine.ctx.currentTime;
    if (nodes.fromSample) {
      nodes.droneFilter.frequency.setTargetAtTime(on ? 1800 : 12000 - intensity * 9000, now, 0.3);
      return;
    }
    nodes.tensionGain.gain.setTargetAtTime(on ? 0.3 : intensity * 0.12, now, 0.4);
    nodes.droneFilter.frequency.setTargetAtTime(
      on ? 190 : 420 - intensity * 190,
      now,
      0.4,
    );
  }

  // Fase da trilha: 'calm' (início), 'tense' (xeque), 'epic' (reta final).
  // As transições são por crossfade (setTargetAtTime), nunca cortes secos.
  function setPhase(next) {
    if (next !== 'calm' && next !== 'tense' && next !== 'epic') return;
    phase = next;
    if (!nodes || !engine.ctx) return;
    const now = engine.ctx.currentTime;
    const tense = phase === 'tense';
    const epic = phase === 'epic';

    if (nodes.fromSample) {
      // Sobre um arquivo: o clima é dado pelo brilho do filtro.
      const cutoff = tense ? 1800 : epic ? 12000 : 12000 - intensity * 9000;
      nodes.droneFilter.frequency.setTargetAtTime(cutoff, now, 1.5);
      return;
    }

    // Crossfade da camada épica.
    nodes.epicGain.gain.setTargetAtTime(epic ? 0.6 : 0, now, 2.2);
    // Voz dissonante sobe no xeque e fica média no épico.
    nodes.tensionGain.gain.setTargetAtTime(
      tense ? 0.3 : epic ? 0.16 : intensity * 0.12,
      now,
      tense ? 0.4 : 2,
    );
    // Filtro do bordão: fecha na tensão, abre no épico.
    nodes.droneFilter.frequency.setTargetAtTime(
      tense ? 190 : epic ? 520 : 420 - intensity * 190,
      now,
      tense ? 0.4 : 2,
    );
  }

  function setRain(value) {
    rainLevel = Math.min(1, Math.max(0, value));
    if (!nodes || !engine.ctx) return;
    nodes.rainGain.gain.setTargetAtTime(rainLevel * 0.1, engine.ctx.currentTime, 2);
  }

  function stop() {
    clearTimeout(drumTimer);
    drumTimer = null;
    if (!nodes || !engine.ctx) {
      nodes = null;
      return;
    }
    const ctx = engine.ctx;
    nodes.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    const dying = nodes;
    setTimeout(() => {
      dying.voices.forEach(({ osc }) => osc.stop());
      dying.epicVoices?.forEach((osc) => osc.stop());
      dying.tension?.stop();
      dying.lfo?.stop();
      dying.source?.stop();
      dying.rain.stop();
      dying.bus.disconnect();
    }, 1500);
    nodes = null;
  }

  return {
    start,
    stop,
    setIntensity,
    setRain,
    setAlert,
    setPhase,
    get playing() {
      return !!nodes;
    },
  };
}
