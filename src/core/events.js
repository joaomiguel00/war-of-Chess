// Emissor de eventos mínimo. O GameView anuncia o que acontece na partida
// (lance, impacto, captura, tabuleiro mudou...) e cada sistema de imersão
// se inscreve no que precisa, sem o núcleo do jogo conhecer nenhum deles.
export function createEmitter() {
  const listeners = new Map();

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type)?.delete(fn);
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        // Um efeito com defeito nunca pode travar a partida.
        console.error(`[evento ${type}]`, err);
      }
    }
  }

  function clear() {
    listeners.clear();
  }

  return { on, emit, clear };
}
