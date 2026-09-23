import { pieceParts } from './rigParts.js';
import { getRig } from '../pieceAnimator.js';

// Diretor de poses: vários sistemas (medo, luto, rendição, idle...) pedem
// poses para a mesma peça ao mesmo tempo; aqui cada canal (cabeça, corpo,
// braços, tremor, arma) fica com o pedido de MAIOR prioridade e a transição
// entre um e outro é sempre suave. Movimento/ataque vence tudo: enquanto a
// peça age, nenhum sistema mexe nela.
//
// Onde cada coisa é aplicada (sem brigar com as animações de lance):
//   - cabeça: pivô Head_Pivot (ninguém mais o usa);
//   - corpo: o modelo interno (filho do invólucro) — o invólucro é do lance;
//   - braços: aditivo nos pivôs do rig, removido na hora quando a peça age.
export const PRIORITY = {
  surrender: 90,
  check: 80,
  grief: 70,
  threat: 60,
  nervous: 50,
  idle: 40,
};

// Respiração de base por tipo (o que antes era o idleMotion).
const BREATH = {
  p: { bob: 0.012, sway: 0.012, speed: 1.5, nod: 0 },
  r: { bob: 0.003, sway: 0.002, speed: 0.6, nod: 0 },
  n: { bob: 0.008, sway: 0.006, speed: 1.2, nod: 0.045 },
  b: { bob: 0.024, sway: 0.005, speed: 0.85, nod: 0 },
  q: { bob: 0.01, sway: 0.007, speed: 0.95, nod: 0 },
  k: { bob: 0.008, sway: 0.005, speed: 0.75, nod: 0 },
};

const HEAD_LIMIT = { yaw: 1.15, pitch: 0.6 };
const CHANNELS = ['head', 'body', 'arms', 'tremble', 'twirl'];

export function idlePhase() {
  return Math.random() * Math.PI * 2;
}

const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function freshState() {
  return {
    head: { yaw: 0, pitch: 0, roll: 0 },
    body: { x: 0, y: 0, z: 0, pitch: 0, roll: 0, yaw: 0 },
    arms: { L: 0, R: 0 },
    applied: { L: 0, R: 0, twirl: 0 },
    tremble: 0,
    twirl: 0,
    requests: [],
  };
}

export function createPoseDirector() {
  const states = new WeakMap();

  function stateOf(piece) {
    let state = states.get(piece);
    if (!state) {
      state = freshState();
      states.set(piece, state);
    }
    return state;
  }

  // pose: { head:{yaw,pitch,roll}, body:{x,y,z,pitch,roll,yaw}, arms:{L,R},
  //         tremble, twirl, rate }  — só os canais informados contam.
  function request(piece, priority, pose) {
    if (!piece) return;
    stateOf(piece).requests.push({ priority, pose });
  }

  function winner(requests, channel) {
    let best = null;
    for (const r of requests) {
      if (r.pose[channel] === undefined) continue;
      if (!best || r.priority > best.priority) best = r;
    }
    return best;
  }

  function applyArms(piece, state, L, R) {
    const rig = getRig(piece);
    if (!rig) return;
    const sign = rig.raiseSign ?? -1;
    if (rig.armL) {
      rig.armL.rotation.x += (L - state.applied.L) * sign;
      state.applied.L = L;
    }
    if (rig.armR) {
      rig.armR.rotation.x += (R - state.applied.R) * sign;
      state.applied.R = R;
    }
  }

  function applyTwirl(parts, state, angle) {
    if (!parts.weapon) return;
    parts.weapon.rotation.y += angle - state.applied.twirl;
    state.applied.twirl = angle;
  }

  // Libera a peça imediatamente (começou a agir): tira os deslocamentos
  // aditivos dos braços/arma para o lance partir da pose original.
  function release(piece) {
    const state = states.get(piece);
    if (!state) return;
    applyArms(piece, state, 0, 0);
    state.arms.L = state.arms.R = 0;
    applyTwirl(pieceParts(piece), state, 0);
    state.twirl = 0;
  }

  // pieces: iterável de invólucros. acting(piece)/selected(piece): estado vindo
  // do jogo. elapsed: relógio da cena.
  function update(dt, elapsed, pieces, { acting, selected }) {
    for (const piece of pieces) {
      const state = stateOf(piece);
      const model = piece.children[0];
      if (!model) {
        state.requests.length = 0;
        continue;
      }
      const type = piece.userData.pieceType;
      const parts = pieceParts(piece);
      const isActing = acting(piece);
      const requests = isActing ? [] : state.requests;
      // Selecionada ou agindo: o que estava tocando some quase na hora.
      const snap = isActing || selected(piece);

      const pick = {};
      for (const channel of CHANNELS) pick[channel] = winner(requests, channel);
      const rateOf = (w, base) => (snap ? 18 : w?.pose.rate ?? base);

      const h = pick.head?.pose.head ?? {};
      const hr = rateOf(pick.head, 6);
      state.head.yaw = approach(state.head.yaw, clamp(h.yaw ?? 0, -HEAD_LIMIT.yaw, HEAD_LIMIT.yaw), hr, dt);
      state.head.pitch = approach(state.head.pitch, clamp(h.pitch ?? 0, -HEAD_LIMIT.pitch, HEAD_LIMIT.pitch), hr, dt);
      state.head.roll = approach(state.head.roll, h.roll ?? 0, hr, dt);

      const b = pick.body?.pose.body ?? {};
      const br = rateOf(pick.body, 5);
      for (const k of ['x', 'y', 'z', 'pitch', 'roll', 'yaw']) {
        state.body[k] = approach(state.body[k], b[k] ?? 0, br, dt);
      }

      state.tremble = approach(state.tremble, pick.tremble?.pose.tremble ?? 0, rateOf(pick.tremble, 8), dt);

      if (isActing) {
        if (state.applied.L || state.applied.R || state.applied.twirl) release(piece);
      } else {
        const a = pick.arms?.pose.arms ?? {};
        const ar = rateOf(pick.arms, 5);
        state.arms.L = approach(state.arms.L, a.L ?? 0, ar, dt);
        state.arms.R = approach(state.arms.R, a.R ?? 0, ar, dt);
        applyArms(piece, state, state.arms.L, state.arms.R);
        if (!pick.twirl && Math.abs(state.twirl) > Math.PI) {
          // Volta completa terminada: é a mesma pose, sem "desgirar" de volta.
          const turns = Math.round(state.twirl / (Math.PI * 2)) * Math.PI * 2;
          state.twirl -= turns;
          state.applied.twirl -= turns;
        }
        state.twirl = approach(state.twirl, pick.twirl?.pose.twirl ?? 0, rateOf(pick.twirl, 6), dt);
        applyTwirl(parts, state, state.twirl);
      }

      // Cabeça: no pivô, se houver; senão o corpo inteiro acompanha um pouco
      // (a torre, fortaleza imóvel, não vira).
      let bodyYaw = state.body.yaw;
      let bodyPitch = state.body.pitch;
      if (parts.head) {
        parts.head.rotation.order = 'YXZ';
        parts.head.rotation.set(
          state.head.pitch * parts.head.userData.pitchSign,
          state.head.yaw,
          state.head.roll,
        );
      } else if (type !== 'r') {
        bodyYaw += state.head.yaw * 0.45;
        bodyPitch += state.head.pitch * 0.35;
      }

      const breath = BREATH[type] ?? BREATH.p;
      const time = elapsed * breath.speed + (piece.userData.idlePhase ?? 0);
      const shake = state.tremble * 0.022;
      const jitter = () => (shake ? (Math.random() - 0.5) * shake : 0);

      model.rotation.order = 'YXZ';
      model.position.set(
        state.body.x + jitter(),
        Math.sin(time) * breath.bob + state.body.y + jitter() * 0.5,
        state.body.z + jitter(),
      );
      model.rotation.set(
        (breath.nod ? Math.sin(time * 1.8) * breath.nod : 0) + bodyPitch + jitter(),
        bodyYaw,
        Math.sin(time * 0.7) * breath.sway + state.body.roll + jitter(),
      );

      state.requests.length = 0;
    }
  }

  // Guinada (no espaço da peça) que faz a frente olhar para um ponto do mundo.
  function lookYaw(piece, target) {
    const world = Math.atan2(target.x - piece.position.x, target.z - piece.position.z);
    return Math.atan2(Math.sin(world - piece.rotation.y), Math.cos(world - piece.rotation.y));
  }

  return { request, update, release, lookYaw, PRIORITY };
}
