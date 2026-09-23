import { createTerrain } from './terrain.js';
import { createBraziers } from './braziers.js';
import { createWarCamp } from './warCamp.js';
import { createGraveyard } from './graveyard.js';
import { createDestruction } from './destruction.js';

// Fachada do campo de batalha em volta do tabuleiro. Cada sistema é um
// módulo independente (terreno, braseiros, acampamento, cemitério,
// destruição); o GameView só conversa com esta fachada e nenhum deles sabe
// nada das regras do xadrez.
export function createBattlefield({ scene, camera, weather }) {
  const terrain = createTerrain({ scene, weather });
  const braziers = createBraziers({ scene, heightAt: terrain.heightAt, weather });
  const camp = createWarCamp({ scene, weather });
  const graveyard = createGraveyard({ scene, heightAt: terrain.heightAt });
  const destruction = createDestruction({
    scene,
    heightAt: terrain.heightAt,
    craters: terrain.craters,
    weather,
  });

  function update(dt, { lightning = 0 } = {}) {
    braziers.update(dt);
    camp.update(dt, camera, lightning);
    destruction.update(dt);
  }

  // Volta ao estado do começo da partida (usado pelo replay completo).
  function reset() {
    graveyard.clear();
    destruction.reset();
  }

  function dispose() {
    destruction.dispose();
    graveyard.dispose();
    camp.dispose();
    braziers.dispose();
    terrain.dispose();
  }

  return {
    update,
    reset,
    dispose,
    heightAt: terrain.heightAt,
    bury: graveyard.bury,
    setDestruction: destruction.setLevel,
    flareUp: braziers.flareUp,
    get destructionLevel() {
      return destruction.level;
    },
  };
}
