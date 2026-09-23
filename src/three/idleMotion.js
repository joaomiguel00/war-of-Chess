// Micro-animações das peças paradas. Tudo é aplicado ao modelo interno
// (filho do invólucro), nunca ao invólucro — é ele que as animações de
// lance, ataque e morte controlam.
const IDLE = {
  // bob: sobe e desce; sway: balanço lateral; nod: acena com a cabeça.
  p: { bob: 0.012, sway: 0.012, speed: 1.5, nod: 0 },
  r: { bob: 0.003, sway: 0.002, speed: 0.6, nod: 0 }, // pedra quase imóvel
  n: { bob: 0.008, sway: 0.006, speed: 1.2, nod: 0.045 },
  b: { bob: 0.024, sway: 0.005, speed: 0.85, nod: 0 }, // flutua
  q: { bob: 0.01, sway: 0.007, speed: 0.95, nod: 0 },
  k: { bob: 0.008, sway: 0.005, speed: 0.75, nod: 0 },
};

export function idlePhase() {
  return Math.random() * Math.PI * 2;
}

export function applyIdleMotion(pieces, elapsed, { tremblingKey = null, tremble = 0 } = {}) {
  for (const [key, wrapper] of pieces) {
    const model = wrapper.children[0];
    if (!model) continue;

    const params = IDLE[wrapper.userData.pieceType] ?? IDLE.p;
    const phase = wrapper.userData.idlePhase ?? 0;
    const time = elapsed * params.speed + phase;

    model.position.y = Math.sin(time) * params.bob;
    model.rotation.z = Math.sin(time * 0.7) * params.sway;
    model.rotation.x = params.nod ? Math.sin(time * 1.8) * params.nod : 0;

    if (key === tremblingKey && tremble > 0) {
      // Rei em xeque: treme no lugar.
      const amount = 0.02 * tremble;
      model.position.x = (Math.random() - 0.5) * amount;
      model.position.z = (Math.random() - 0.5) * amount;
      model.position.y += (Math.random() - 0.5) * amount * 0.5;
      model.rotation.z += (Math.random() - 0.5) * amount;
    } else {
      model.position.x = 0;
      model.position.z = 0;
    }
  }
}
