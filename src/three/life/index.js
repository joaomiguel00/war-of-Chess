import { createPoseDirector, idlePhase } from './poseDirector.js';
import { createIdlePersonality } from './idlePersonality.js';
import { createFear } from './fear.js';
import { createSurrender } from './surrender.js';
import { createBreath } from './breath.js';
import { createFootprints, surfaceFor } from './footprints.js';
import { applyClothWind, updateClothWind } from './clothWind.js';
import { onPieceStep } from '../pieceAnimator.js';
import { addPieceDecorator } from '../pieceModels.js';

export { idlePhase };

// Tecido ao vento em toda peça criada (tabuleiro, cemitério, replay).
addPieceDecorator(applyClothWind);

// "Vida" das peças: comportamentos que reagem à partida sem tocar nas regras.
// Escuta os eventos do GameView e, a cada quadro, deixa o diretor de poses
// decidir quem controla cada peça.
//   ctx.events       emissor do GameView
//   ctx.getPieces()  Map "linha,coluna" -> invólucro da peça
//   ctx.isActing(p)  a peça está andando/atacando
//   ctx.isSelected(p)
//   ctx.getWind()    força do vento atual (clima x atos x rajadas)
export function createLife({ scene, events, getPieces, isActing, isSelected, getWind, weather, theme }) {
  const director = createPoseDirector();
  const personality = createIdlePersonality({ director });
  const fear = createFear({ director, getPieces });
  const surrender = createSurrender({ scene, director });
  const breath = weather.id === 'neve' ? createBreath({ scene, director }) : null;
  const footprints = createFootprints({ scene, surface: surfaceFor(weather.id, theme.id) });

  let elapsed = 0;
  let lastMoveAt = 0;
  const busy = (piece) => isActing(piece) || isSelected(piece);

  const offs = [
    events.on('boardChanged', ({ game }) => fear.onBoardChanged(game)),
    events.on('moveStart', () => (lastMoveAt = elapsed)),
    events.on('moveEnd', () => (lastMoveAt = elapsed)),
    events.on('capture', (payload) => fear.onCapture({ ...payload, elapsed })),
    events.on('hover', (payload) => fear.onHover(payload)),
    events.on('reset', () => {
      fear.reset();
      surrender.reset();
      footprints.clear();
      lastMoveAt = elapsed;
    }),
    onPieceStep((step) => footprints.step(step)),
  ];

  function update(dt) {
    elapsed += dt;
    const pieces = [...getPieces().values()];
    const wind = getWind();

    fear.update(elapsed);
    surrender.update();
    personality.update(elapsed, pieces, { quietFor: elapsed - lastMoveAt, busy });
    breath?.update(dt, elapsed, pieces, { acting: isActing, wind });
    director.update(dt, elapsed, pieces, { acting: isActing, selected: isSelected });

    updateClothWind(elapsed, wind);
    footprints.update(dt);
  }

  function dispose() {
    offs.forEach((off) => off());
    breath?.dispose();
    footprints.dispose();
    surrender.dispose();
  }

  return {
    update,
    dispose,
    director,
    release: director.release,
    playSurrender: surrender.play,
    get hesitating() {
      return fear.hesitating;
    },
  };
}
