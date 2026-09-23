import { createAudioEngine } from './engine.js';
import { createSfx } from './sfx.js';
import { createMusic } from './music.js';

const engine = createAudioEngine();
const sfx = createSfx(engine);
const music = createMusic(engine);

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
  setMood(intensity, rain) {
    music.setIntensity(intensity);
    music.setRain(rain);
  },
  setAlert: music.setAlert,
  setMusicPhase: music.setPhase,
  playAttack: sfx.playAttack,
  playDeath: sfx.playDeath,
  playStep: sfx.playStep,
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
