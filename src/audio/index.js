import { createAudioEngine } from './engine.js';
import { createSfx } from './sfx.js';
import { createMusic } from './music.js';
import { createAmbience } from './ambience.js';
import { createHeartbeat, createMarch } from './tension.js';

const engine = createAudioEngine();
const sfx = createSfx(engine);
const music = createMusic(engine);
const ambience = createAmbience(engine);
const heartbeat = createHeartbeat(engine);
const march = createMarch(engine);

// Fachada única usada pelo resto do jogo. Todo som passa pelo mesmo volume
// geral (e pelo mudo) do motor.
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
  // Ambiente de batalha (vento, corvos, fogueira, trovão) conforme clima e tema.
  startAmbience(weatherId, themeAmbience) {
    engine.unlock();
    ambience.start(weatherId, themeAmbience);
  },
  stopAmbience: ambience.stop,
  playThunder: ambience.thunder,
  playGust: ambience.gust,
  setBattleLevel: ambience.setBattle,
  setSideMorale: ambience.setSideMorale,
  setSidePan: ambience.setSidePan,
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
  playHerald: sfx.playHerald,
  playUi: sfx.playUi,
  // Tensão.
  heartbeat,
  march,
  muffle: engine.muffle,
  setVolume: engine.setVolume,
  setMuted: engine.setMuted,
  get ctx() {
    return engine.ctx;
  },
  get master() {
    return engine.master;
  },
};
