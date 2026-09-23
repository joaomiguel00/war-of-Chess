import { createTerrain } from './terrain.js';
import { createBraziers } from './braziers.js';
import { createWarCamp } from './warCamp.js';
import { createGraveyard } from './graveyard.js';
import { createDestruction } from './destruction.js';
import { createBoardScars } from './boardScars.js';
import { createFallenWeapons } from './fallenWeapons.js';
import { createBrazierShadow } from './brazierShadow.js';

// Fachada do campo de batalha em volta do tabuleiro. Cada sistema é um
// módulo independente (terreno, braseiros, acampamento, cemitério,
// destruição, cicatrizes, armas caídas, sombra dos braseiros); o GameView só
// conversa com esta fachada e nenhum deles sabe nada das regras do xadrez.
export function createBattlefield({ scene, camera, weather, theme, emblems }) {
  const terrain = createTerrain({ scene, weather, theme });
  const braziers = createBraziers({ scene, heightAt: terrain.heightAt, weather });
  const camp = createWarCamp({ scene, weather, theme, emblems });
  const graveyard = createGraveyard({ scene, heightAt: terrain.heightAt, emblems });
  const destruction = createDestruction({
    scene,
    heightAt: terrain.heightAt,
    craters: terrain.craters,
    weather,
  });
  const scars = createBoardScars({ scene });
  const weapons = createFallenWeapons({ scene });
  const shadow = createBrazierShadow({ scene, heightAt: terrain.heightAt });

  function update(dt, { lightning = 0, wind = weather.wind, busy = false } = {}) {
    terrain.update(dt);
    braziers.update(dt);
    camp.update(dt, camera, { lightning, wind });
    graveyard.update(dt, wind);
    destruction.update(dt);
    weapons.update(dt);
    shadow.update(dt, { busy });
  }

  // Volta ao estado do começo da partida (usado pelo replay completo).
  function reset() {
    graveyard.clear();
    destruction.reset();
    scars.clear();
    weapons.clear();
    camp.setMorale({ w: 1, b: 1 });
  }

  function setEmblems(next) {
    camp.setEmblems(next);
    graveyard.setEmblems(next);
  }

  function dispose() {
    shadow.dispose();
    weapons.dispose();
    scars.dispose();
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
    setEmblems,
    heightAt: terrain.heightAt,
    bury: graveyard.bury,
    setDestruction: destruction.setLevel,
    setMorale: camp.setMorale,
    flareUp: braziers.flareUp,
    scar: scars.scar,
    leaveWeapon: weapons.leave,
    setBoard: weapons.setBoard,
    shadowFocusMove: shadow.focusMove,
    shadowFocusSide: shadow.focusSide,
    get destructionLevel() {
      return destruction.level;
    },
  };
}
