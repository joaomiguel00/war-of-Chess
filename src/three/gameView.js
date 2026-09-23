import * as THREE from 'three';
import { createBoardScene, squareToWorld } from './boardScene.js';
import { createHighlightLayer } from './highlights.js';
import { createPieceMesh } from './pieceModels.js';
import { createCameraRig } from './cameraRig.js';
import { createDecalLayer } from './decals.js';
import { createCombat } from './combat.js';
import { createEnvironment } from './environment.js';
import { createCinematic } from './cinematic.js';
import { createSpecialFx } from './specialFx.js';
import { createReplay, scoreMoment, pickHighlights } from './replay.js';
import { applyIdleMotion, idlePhase } from './idleMotion.js';
import { applyVeteranMark } from './pieceModels.js';
import { createVictoryScene } from './victoryScene.js';
import { walkTo } from './pieceAnimator.js';
import { animate, easeInOut, easeOutBack, wait, setTimeScale } from './animation.js';
import { cloneBoard, findKing, other } from '../chess/moveGen.js';
import { STATUS, ChessGame } from '../chess/game.js';
import { settings } from '../settings.js';
import { audio } from '../audio/index.js';

// A partir de quantas capturas o clima chega ao ponto mais sombrio (nevasca).
// Mais baixo = a mudança de clima acontece mais rápido.
const MOOD_FULL_AT = 8;

const key = (row, col) => `${row},${col}`;

export class GameView {
  constructor(container, game, callbacks = {}) {
    this.container = container;
    this.game = game;
    this.callbacks = callbacks;

    const scene = createBoardScene(container);
    this.scene = scene.scene;
    this.camera = scene.camera;
    this.renderer = scene.renderer;
    this.controls = scene.controls;
    this.boardGroup = scene.boardGroup;
    this.tiles = scene.tiles;
    this.lights = scene.lights;
    this.boardLights = scene.boardLights;
    this._disposeScene = scene.dispose;
    this._onResize = scene.onResize;

    // Tabuleiro inicial guardado para o replay reproduzir do zero.
    this.initialBoard = cloneBoard(game.board);
    // Relógio opcional, fornecido por quem cria a partida.
    this.clock = callbacks.clock ?? null;
    this.replaying = false;
    this._replayPromotion = 'q';
    this._musicPhase = null;

    this.highlights = createHighlightLayer(this.scene);
    this.cameraRig = createCameraRig(this.camera, this.controls);
    this.decals = createDecalLayer(this.scene);
    this.combat = createCombat({
      scene: this.scene,
      decals: this.decals,
      audio,
      shake: (amount) => this._addShake(amount),
    });
    this.environment = createEnvironment({ scene: this.scene, lights: scene.lights });
    this.cinematic = createCinematic({ camera: this.camera, controls: this.controls });
    this.specialFx = createSpecialFx({ scene: this.scene });
    this.replay = createReplay({
      scene: this.scene,
      camera: this.camera,
      controls: this.controls,
      cinematic: this.cinematic,
      audio,
    });
    this.victory = createVictoryScene({
      scene: this.scene,
      camera: this.camera,
      controls: this.controls,
      lights: this.lights,
      boardLights: this.boardLights,
    });

    // Luz vermelha que pulsa sobre o rei em xeque.
    this.checkLight = new THREE.PointLight(0xff2a2a, 0, 7, 2);
    this.checkLight.visible = false;
    this.scene.add(this.checkLight);

    this.moments = [];
    this.elapsed = 0;
    this.hovered = null;
    this._hoverAt = 0;
    this._shakeTrauma = 0;
    this._shakeOffset = new THREE.Vector3();

    this.pieceGroup = new THREE.Group();
    this.scene.add(this.pieceGroup);
    this.pieces = new Map();

    this.selected = null;
    this.legalMoves = [];
    this.busy = false;
    this.disposed = false;

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._onClick = this._onClick.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this.renderer.domElement.addEventListener('pointerdown', this._onClick);
    this.renderer.domElement.addEventListener('pointermove', this._onPointerMove);

    this._buildPieces();
    this._renderHighlights();
    this._updateMood();

    this._lastFrame = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _loop(now = performance.now()) {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this._lastFrame) / 1000);
    this._lastFrame = now;
    this.elapsed += dt;

    this.environment.update(dt);
    this._updateAliveMotion();
    // Fita de LED: destaca o lado de quem joga (ou de quem venceu) e pulsa no xeque.
    this.boardLights.update(dt, {
      turn: this.game.isGameOver() && this.game.winner ? this.game.winner : this.game.turn,
      check: this.game.status === STATUS.CHECK,
    });

    // Relógio: desconta o tempo do jogador ativo e encerra por tempo esgotado.
    if (this.clock?.enabled && !this.replaying) {
      this.clock.tick();
      this.callbacks.onClockTick?.(this.clock);
      if (this.clock.flagged && !this._timedOut && !this.game.isGameOver()) {
        this._timedOut = true;
        this._handleTimeout(this.clock.flagged);
      }
    }

    this.controls.update();

    // Tremor de câmera no impacto: o deslocamento é aplicado só para este
    // render e desfeito em seguida, então nunca briga com a órbita nem com
    // a câmera cinematográfica (o efeito líquido no frame é zero).
    const shaken = this._sampleShake(dt);
    if (shaken) this.camera.position.add(this._shakeOffset);
    this.renderer.render(this.scene, this.camera);
    if (shaken) this.camera.position.sub(this._shakeOffset);

    requestAnimationFrame(this._loop);
  }

  // Acumula "trauma" de tremor (0..1). Impactos maiores somam mais.
  _addShake(amount = 0.4) {
    this._shakeTrauma = Math.min(1, this._shakeTrauma + amount);
  }

  // Calcula o deslocamento do frame e decai o trauma. O tremor cresce com o
  // quadrado do trauma, o que dá um golpe forte que se acalma rápido.
  _sampleShake(dt) {
    if (this._shakeTrauma < 0.001) {
      this._shakeTrauma = 0;
      return false;
    }
    const magnitude = this._shakeTrauma * this._shakeTrauma * 0.22;
    this._shakeOffset.set(
      (Math.random() * 2 - 1) * magnitude,
      (Math.random() * 2 - 1) * magnitude,
      (Math.random() * 2 - 1) * magnitude,
    );
    this._shakeTrauma = Math.max(0, this._shakeTrauma - dt * 2.4);
    return true;
  }

  // Respiração das peças + tremor do rei em xeque + pulso da luz de tensão.
  _updateAliveMotion() {
    const inCheck =
      this.game.status === STATUS.CHECK || this.game.status === STATUS.CHECKMATE;
    let tremblingKey = null;

    if (inCheck) {
      const king = findKing(this.game.board, this.game.turn);
      if (king) {
        tremblingKey = key(king.row, king.col);
        const position = squareToWorld(king.row, king.col);
        const pulse = 0.55 + 0.45 * Math.sin(this.elapsed * 7);
        this.checkLight.visible = true;
        this.checkLight.position.set(position.x, 1.3, position.z);
        this.checkLight.intensity = 9 * pulse;
      }
    } else if (this.checkLight.visible) {
      this.checkLight.visible = false;
      this.checkLight.intensity = 0;
    }

    applyIdleMotion(this.pieces, this.elapsed, {
      tremblingKey,
      tremble: inCheck ? 1 : 0,
    });
  }

  // O clima acompanha o número de peças já tiradas do tabuleiro.
  _updateMood() {
    const captured = this.game.captured.w.length + this.game.captured.b.length;
    this.environment.setProgress(captured / MOOD_FULL_AT);
    audio.setMood(this.environment.progress, this.environment.rainLevel);
    this._updateMusicPhase();
  }

  // Trilha dinâmica: calma no começo, tensa no xeque, épica na reta final.
  _updateMusicPhase() {
    const inCheck =
      this.game.status === STATUS.CHECK || this.game.status === STATUS.CHECKMATE;
    let total = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) if (this.game.board[r][c]) total++;
    }
    const phase = inCheck ? 'tense' : total <= 8 ? 'epic' : 'calm';
    if (phase !== this._musicPhase) {
      this._musicPhase = phase;
      audio.setMusicPhase?.(phase);
    }
  }

  startClock() {
    this.clock?.start(this.game.turn);
  }

  _buildPieces() {
    this.pieceGroup.clear();
    this.pieces.clear();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.game.board[r][c];
        if (!piece) continue;
        this._spawnPiece(piece.type, piece.color, r, c);
      }
    }
  }

  _spawnPiece(type, color, row, col) {
    const mesh = createPieceMesh(type, color);
    const pos = squareToWorld(row, col);
    mesh.position.set(pos.x, 0, pos.z);
    mesh.userData.idlePhase = idlePhase();
    this.pieceGroup.add(mesh);
    this.pieces.set(key(row, col), mesh);
    applyVeteranMark(mesh, this.game.board[row][col]?.kills ?? 0);
    return mesh;
  }

  // Tooltip de veterano: quantos abates a peça sob o cursor já tem.
  _onPointerMove(event) {
    if (!this.callbacks.onHoverPiece || this.busy) return;
    const now = performance.now();
    if (now - this._hoverAt < 70) return;
    this._hoverAt = now;

    const square = this._squareAtPointer(event);
    const piece = square ? this.game.board[square.row][square.col] : null;

    if (!piece || !piece.kills) {
      if (this.hovered) {
        this.hovered = null;
        this.callbacks.onHoverPiece(null);
      }
      return;
    }

    const id = `${square.row},${square.col}`;
    if (this.hovered === id) {
      this.callbacks.onHoverPiece({ piece, x: event.clientX, y: event.clientY });
      return;
    }
    this.hovered = id;
    this.callbacks.onHoverPiece({ piece, x: event.clientX, y: event.clientY });
  }

  // Animação de revelação do tabuleiro (usada no modo customizado).
  async playRevealAnimation() {
    const entries = [...this.pieces.entries()];
    for (const [, mesh] of entries) {
      mesh.scale.set(0.001, 0.001, 0.001);
      mesh.visible = false;
    }

    const sorted = entries.sort((a, b) => {
      const [ra] = a[0].split(',').map(Number);
      const [rb] = b[0].split(',').map(Number);
      return Math.abs(3.5 - ra) - Math.abs(3.5 - rb);
    });

    await Promise.all(
      sorted.map(
        ([, mesh], index) =>
          new Promise((resolve) => {
            setTimeout(() => {
              mesh.visible = true;
              animate(420, (t) => {
                const e = easeInOut(t);
                mesh.scale.setScalar(e);
                mesh.position.y = (1 - e) * 1.2;
              }).then(() => {
                mesh.scale.setScalar(1);
                mesh.position.y = 0;
                resolve();
              });
            }, index * 22);
          }),
      ),
    );
  }

  // Casa sob o ponteiro: bate na peça ou na casa, o que vier primeiro.
  _squareAtPointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);

    const hits = this._raycaster.intersectObjects(
      [...this.tiles, ...this.pieceGroup.children],
      true,
    );
    if (!hits.length) return null;

    let object = hits[0].object;
    if (object.userData?.isTile) {
      return { row: object.userData.row, col: object.userData.col };
    }

    while (object.parent && object.parent !== this.pieceGroup) object = object.parent;
    for (const [k, mesh] of this.pieces) {
      if (mesh === object) {
        const [row, col] = k.split(',').map(Number);
        return { row, col };
      }
    }
    return null;
  }

  _onClick(event) {
    if (this.busy || this.disposed || this.replaying || this.game.isGameOver()) return;
    if (event.button !== undefined && event.button !== 0) return;

    const square = this._squareAtPointer(event);
    if (square) this._handleSquareClick(square.row, square.col);
  }

  _handleSquareClick(row, col) {
    if (this.selected) {
      const move = this.legalMoves.find((m) => m.to.row === row && m.to.col === col);
      if (move) {
        this._playMove(move);
        return;
      }
    }

    const piece = this.game.board[row][col];
    if (piece && piece.color === this.game.turn) {
      this.selected = { row, col };
      this.legalMoves = this.game.getLegalMoves(row, col);
    } else {
      this.selected = null;
      this.legalMoves = [];
    }
    this._renderHighlights();
  }

  _renderHighlights() {
    this.highlights.clear();

    if (this.selected) {
      this.highlights.showSelection(this.selected.row, this.selected.col);
      for (const move of this.legalMoves) {
        const isCapture = !!move.capture || !!this.game.board[move.to.row][move.to.col];
        this.highlights.showMove(move.to.row, move.to.col, isCapture);
      }
    }

    if (this.game.status === STATUS.CHECK || this.game.status === STATUS.CHECKMATE) {
      const king = findKing(this.game.board, this.game.turn);
      if (king) this.highlights.showCheck(king.row, king.col);
    }
  }

  async _playMove(move) {
    this.busy = true;
    this.selected = null;
    this.legalMoves = [];
    this.highlights.clear();

    let promotionType;
    if (move.promotion) {
      promotionType = this.replaying
        ? this._replayPromotion
        : await this.callbacks.onPromotionNeeded?.(move);
      if (!promotionType) promotionType = 'q';
    }

    const movingColor = this.game.turn;
    const mesh = this.pieces.get(key(move.from.row, move.from.col));
    const movingPiece = this.game.board[move.from.row][move.from.col];
    const snapshot = cloneBoard(this.game.board);

    const victimSquare = move.enPassant
      ? { row: move.from.row, col: move.to.col }
      : { row: move.to.row, col: move.to.col };
    const victimKey = key(victimSquare.row, victimSquare.col);
    const victimPiece = this.game.board[victimSquare.row][victimSquare.col];
    const victimMesh = this.pieces.get(victimKey);

    const animations = [];

    if (victimMesh && victimMesh !== mesh && victimPiece) {
      this.pieces.delete(victimKey);

      const attackerPos = squareToWorld(move.from.row, move.from.col);
      const victimPos = squareToWorld(victimSquare.row, victimSquare.col);

      await this.cinematic.start(attackerPos, victimPos);

      if (move.enPassant) {
        // Ataque furtivo: o vulto corre até a vítima antes do golpe.
        await this.specialFx.playEnPassant(attackerPos, victimPos, movingPiece.color);
      }

      animations.push(
        this.combat.playCapture({
          attacker: mesh,
          attackerType: movingPiece.type,
          attackerColor: movingPiece.color,
          from: squareToWorld(move.from.row, move.from.col),
          to: squareToWorld(move.to.row, move.to.col),
          victim: victimMesh,
          victimType: victimPiece.type,
          victimColor: victimPiece.color,
          victimPos: squareToWorld(victimSquare.row, victimSquare.col),
          victimSquare,
          onVictimGone: (dead) => this.pieceGroup.remove(dead),
        }),
      );
    } else {
      audio.playStep(movingPiece.type);
      animations.push(this._animateSlide(mesh, squareToWorld(move.to.row, move.to.col)));
    }

    if (move.castle) {
      const rookKey = key(move.castle.rookFrom.row, move.castle.rookFrom.col);
      const rookMesh = this.pieces.get(rookKey);
      this.pieces.delete(rookKey);
      this.pieces.set(key(move.castle.rookTo.row, move.castle.rookTo.col), rookMesh);
      animations.push(
        this.specialFx.playCastle(
          squareToWorld(move.castle.rookFrom.row, move.castle.rookFrom.col),
          squareToWorld(move.to.row, move.to.col),
          movingPiece.color,
        ),
      );
      animations.push(
        this._animateSlide(rookMesh, squareToWorld(move.castle.rookTo.row, move.castle.rookTo.col)),
      );
    }

    this.pieces.delete(key(move.from.row, move.from.col));
    this.pieces.set(key(move.to.row, move.to.col), mesh);

    await Promise.all(animations);
    await this.cinematic.end();

    this.game.makeMove(move, promotionType);

    // A peça que capturou vira veterana e ganha um entalhe na base.
    if (victimPiece) {
      const survivor = this.game.board[move.to.row][move.to.col];
      if (survivor) {
        survivor.kills = (survivor.kills ?? 0) + 1;
        applyVeteranMark(this.pieces.get(key(move.to.row, move.to.col)), survivor.kills);
      }
    }

    if (move.promotion) {
      const position = squareToWorld(move.to.row, move.to.col);
      this.pieceGroup.remove(mesh);
      this.pieces.delete(key(move.to.row, move.to.col));

      // Coroação: a luz desce antes da peça nova assumir o lugar.
      const ceremony = this.specialFx.playPromotion(position, movingColor);
      const promoted = this._spawnPiece(promotionType, movingColor, move.to.row, move.to.col);
      promoted.scale.setScalar(0.001);
      await animate(520, (t) => promoted.scale.setScalar(easeInOut(t)));
      promoted.scale.setScalar(1);
      await ceremony;
    }

    if (!this.replaying) {
      this._recordMoment({
        snapshot,
        move,
        movingPiece,
        victimPiece,
        victimSquare,
        promotionType,
      });
    }

    this._renderHighlights();
    this._updateMood();

    audio.setAlert(this.game.status === STATUS.CHECK);
    if (this.game.status === STATUS.CHECK) audio.playUi('check');

    // No xeque-mate o rei não é capturado: ele se ajoelha e fica no tabuleiro.
    if (this.game.status === STATUS.CHECKMATE) {
      const king = findKing(this.game.board, this.game.turn);
      if (king) {
        audio.playDeath('k');
        await this.combat.playKingFall({
          mesh: this.pieces.get(key(king.row, king.col)),
          position: squareToWorld(king.row, king.col),
          attackerPos: squareToWorld(move.to.row, move.to.col),
        });
      }
    }

    this.callbacks.onStatusChange?.(this.game);

    if (this.game.isGameOver()) {
      if (!this.replaying) {
        this.clock?.stop();
        const winner = this.game.winner;
        await this._finish({
          kind: this.game.status,
          winner,
          matingSquare:
            this.game.status === STATUS.CHECKMATE && winner
              ? { row: move.to.row, col: move.to.col }
              : null,
        });
      }
    } else if (!this.replaying) {
      this.clock?.switchTo(this.game.turn);
      await this.cameraRig.rotateToSide(this.game.turn);
    }

    this.busy = false;
  }

  // Encerramento da partida: som de vitória, cena cinematográfica (quando há
  // uma peça que deu o mate) e entrega do resultado para a interface.
  async _finish(result) {
    audio.setMusicPhase?.('epic');
    if (result.winner) audio.playUi('victory');
    if (result.matingSquare) {
      const mesh = this.pieces.get(key(result.matingSquare.row, result.matingSquare.col));
      await this.victory.play({ pieceMesh: mesh, winnerColor: result.winner });
    }
    await this.callbacks.onGameOver?.(result);
  }

  // Tempo esgotado: o jogador da cor `color` perde na hora.
  _handleTimeout(color) {
    this.busy = true;
    this.clock?.stop();
    this.selected = null;
    this.legalMoves = [];
    this.highlights.clear();
    this._finish({ kind: 'timeout', winner: other(color), loser: color, matingSquare: null });
  }

  // Reproduz a partida inteira do início ao fim, reusando as animações.
  async runReplay({
    getSpeed = () => 1,
    isPaused = () => false,
    isStopped = () => false,
    onProgress,
    onDone,
  } = {}) {
    const moves = this.game.history.slice();
    const savedCinematic = settings.cinematic;
    settings.cinematic = false; // sem câmera lenta de captura durante o replay
    this.victory.restore();

    this.replaying = true;
    this.busy = true;
    this.selected = null;
    this.legalMoves = [];
    this.highlights.clear();
    this.decals.clear();

    this.game = new ChessGame(cloneBoard(this.initialBoard));
    this._buildPieces();
    this._musicPhase = null;
    this._updateMood();
    this.cameraRig.snapToSide(this.game.turn);

    for (let i = 0; i < moves.length; i++) {
      if (this.disposed || isStopped()) break;
      while (isPaused() && !this.disposed && !isStopped()) await wait(120);
      if (this.disposed || isStopped()) break;
      setTimeScale(Math.max(0.1, getSpeed()));
      this._replayPromotion = moves[i].promotion ? moves[i].promotionType || 'q' : undefined;
      await this._playMove(moves[i]);
      onProgress?.(i + 1, moves.length);
    }

    setTimeScale(1);
    settings.cinematic = savedCinematic;
    this.replaying = false;
    this.busy = false;
    onDone?.();
  }

  // Guarda o lance caso ele tenha valor de destaque (captura, xeque,
  // promoção, roque, en passant ou o mate).
  _recordMoment({ snapshot, move, movingPiece, victimPiece, victimSquare, promotionType }) {
    const scored = scoreMoment({
      move,
      movingType: movingPiece.type,
      victimType: victimPiece?.type,
      status: this.game.status,
      promotionType,
    });
    if (!scored) return;

    this.moments.push({
      index: this.moments.length,
      score: scored.score,
      caption: scored.caption,
      board: snapshot,
      move,
      movingType: movingPiece.type,
      movingColor: movingPiece.color,
      victimType: victimPiece?.type,
      victimColor: victimPiece?.color,
      victimSquare: victimPiece ? victimSquare : null,
    });
  }

  async _playHighlights() {
    const highlights = pickHighlights(this.moments, 3);
    if (!highlights.length) return;

    this.pieceGroup.visible = false;
    this.callbacks.onReplayStart?.();

    await this.replay.play(highlights, {
      onCaption: (text) => this.callbacks.onReplayCaption?.(text),
    });

    this.pieceGroup.visible = true;
    this.callbacks.onReplayEnd?.();
  }

  _animateSlide(mesh, target, duration = 360) {
    // Peças com pernas/braços nomeados caminham; as outras deslizam.
    const walk = walkTo(mesh, target);
    if (walk) return walk;

    const start = mesh.position.clone();
    return animate(duration, (t) => {
      // Deslocamento horizontal com leve ultrapassagem no fim: a peça
      // assenta na casa em vez de parar de forma seca.
      const e = easeOutBack(easeInOut(t), 0.9);
      mesh.position.x = start.x + (target.x - start.x) * e;
      mesh.position.z = start.z + (target.z - start.z) * e;
      // Arco de salto suavizado (nasce e morre sem solavanco).
      mesh.position.y = Math.sin(Math.PI * easeInOut(t)) * 0.3;
    }).then(() => {
      mesh.position.set(target.x, 0, target.z);
    });
  }

  focusOnSide(color) {
    this.cameraRig.snapToSide(color);
  }

  dispose() {
    this.disposed = true;
    this.renderer.domElement.removeEventListener('pointerdown', this._onClick);
    this.renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.cinematic.cancel();
    this.combat.dispose();
    this.specialFx.dispose();
    this.replay.dispose();
    this.victory.dispose();
    this.decals.clear();
    this.environment.dispose();
    this._disposeScene();
  }
}
