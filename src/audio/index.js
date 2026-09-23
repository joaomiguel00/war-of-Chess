import { createAudioEngine } from './engine.js';
import { createSfx } from './sfx.js';
import { createMusic } from './music.js';
import { createAmbience } from './ambience.js';

const engine = createAudioEngine();
const sfx = createSfx(engine);
const music = createMusic(engine);
const ambience = createAmbience(engine);

// Fachada única usada pelo resto do jogo.
export const audio = {
  unlock() {
    engine.unlock();
  },
  startMusic() {
    engine.unlock();
    // Espera os arquivos do manifesto para saber se há trilha própria.
    engine.whenLoaded().then(() => music.start());
  },
  stopMusic: music.stop,
  // Ambiente de batalha (vento, corvos, fogueira, trovão) conforme o clima.
  startAmbience(weatherId) {
    engine.unlock();
    ambience.start(weatherId);
  },
  stopAmbience: ambience.stop,
  playThunder: ambience.thunder,
  setBattleLevel: ambience.setBattle,
  setMood(intensity, rain) {
    music.setIntensity(intensity);
    music.setRain(rain);
  },
  setAlert: music.setAlert,
  setMusicPhase: music.setPhase,
  playWindup: sfx.playWindup,
  playImpact: sfx.playImpact,
  playDeath: sfx.playDeath,
  playStep: sfx.playStep,
  playWarHorn: sfx.playWarHorn,
  playUi: sfx.playUi,
  setVolume: engine.setVolume,
  setMuted: engine.setMuted,
  get ctx() {
    return engine.ctx;
  },
  get master() {
    return engine.master;
  },
};
