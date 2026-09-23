# War of Chess

Xadrez 3D no navegador com visual dark fantasy low poly, para dois jogadores no
mesmo dispositivo (hot-seat). Feito com **Three.js + Vite**, sem framework de UI.

## Como rodar

```bash
cd chess-game
npm install
npm run dev      # abre em http://localhost:5173
```

Outros comandos:

```bash
npm run build    # gera a versão de produção em dist/
npm run preview  # serve o build de produção
```

## Deploy (Railway)

A raiz do repositório já vem pronta para o Railway (`package.json`, `railway.json`
e `server.js`): o build roda `npm run build` (instala e compila `chess-game`) e o
start sobe `server.js`, um servidor estático sem dependências que usa a porta da
variável `PORT`. Ele serve o jogo em `/` e o site institucional da raiz em `/site/`;
nada fora dessas pastas (como `.git`) é exposto. No Railway, o serviço precisa
apontar para a branch que contém o jogo.

## O que já está implementado

**Regras completas de xadrez**

- Movimento e captura de todas as peças, xeque, xeque-mate e afogamento.
- Roque (rei e torre que nunca se moveram, caminho livre e rei sem passar por
  casa atacada).
- En passant e promoção de peão (com escolha da peça).
- Empate por repetição tripla e pela regra dos 50 lances.

**Dois modos de início**

1. **Padrão** — posição clássica.
2. **Montagem customizada** — cada jogador posiciona suas 16 peças em segredo,
   usando até 3 fileiras do seu lado. Regras extras:
   - os dois bispos precisam ficar em casas de cores diferentes;
   - peão que começa fora da fileira padrão (a 2ª) só anda 1 casa no primeiro
     lance;
   - se a montagem deixaria o próprio rei em xeque na revelação, ela é
     recusada e só aquele jogador refaz o posicionamento;
   - depois das duas montagens, o tabuleiro completo é revelado com animação.

**Combate (etapa 2)**

- Cada tipo de peça tem uma animação de ataque própria ao capturar: o peão
  golpeia com o escudo, a torre investe como aríete, o cavalo salta e
  pisoteia, o bispo dispara um feixe do cajado, a rainha atravessa a casa
  num golpe giratório e o rei faz uma investida pesada.
- Cada tipo tem também sua morte: a torre desmorona em tijolos, a coroa da
  rainha cai e rola, o cavalo tomba levantando poeira, o cajado do bispo se
  parte no chão, o peão cai largando o escudo e o rei cai de joelhos.
- No xeque-mate o rei derrotado se ajoelha e permanece no tabuleiro — ele
  nunca é capturado de fato.
- Capturas deixam marcas permanentes na casa (mancha, poeira e cacos). As
  marcas são rentes ao tabuleiro, escurecem a cada nova captura e têm teto
  de 20 grupos; passando disso, as mais antigas são descartadas.
- O menu inicial tem o toggle **Sangue e destroços**, que desliga as marcas
  por completo (as animações de combate continuam). A escolha fica salva no
  navegador.

**Ambiente e som (etapa 3)**

- Arena sobre plataforma de pedra num campo de batalha com escombros, lanças
  fincadas e ruínas ao longe; névoa baixa, tochas acesas nos quatro cantos,
  bandeiras dos dois exércitos nos flancos e poeira suspensa no ar.
- O clima evolui com a partida: a cada captura a luz cai, a névoa engrossa e
  as tochas passam a dominar a cena. Passando de ~9 capturas começa uma chuva
  leve, que aumenta até o fim.
- Áudio sintetizado em Web Audio API (nenhum arquivo necessário): som de
  ataque e de morte próprios para cada tipo de peça, passos diferentes por
  peça, trilha ambiente com bordão grave, tambores de guerra que aceleram
  conforme a partida azeda, e camada de chuva.
- Volume e mudo no menu inicial (salvos no navegador) e um botão de mudo no
  HUD durante a partida.

**Polimento e imersão (etapa 4)**

- **Câmera cinematográfica** opcional nas capturas: aproxima em câmera lenta,
  segura o golpe por ~1,3 s e devolve o enquadramento e o controle ao jogador.
- **Peças vivas**: quem está parado respira, o cavalo acena com a cabeça, o
  bispo flutua e a torre fica quase imóvel, como convém à pedra.
- **Xeque**: o rei ameaçado treme, uma luz vermelha pulsa sobre a casa dele e
  a trilha fecha o filtro e sobe a voz dissonante.
- **Veteranos**: cada captura acrescenta um entalhe brilhante na base da peça
  (até cinco). Passar o mouse mostra o nome e a contagem de abates.
- **Lances especiais com cena própria**: promoção vira cerimônia de coroação
  com coluna de luz e faíscas, o roque abre portões de pedra na casa da torre
  e o en passant é um golpe furtivo com rastro e corte.
- **Fim de jogo**: depois do rei se ajoelhar, um replay mostra até três
  momentos da partida (com legenda) antes da tela de vitória; clique ou
  tecle para pular.
- **Menu de opções** reunindo sangue/destroços, câmera cinematográfica e
  volume/mudo, acessível do menu inicial e do HUD (⚙) durante a partida.

**Câmera e interação**

- Órbita livre com zoom (OrbitControls); a câmera gira suavemente para o lado
  de quem joga a cada turno.
- Clique numa peça para ver os lances legais (ponto verde = lance simples,
  anel vermelho = captura); clique no destino para mover.

## Estrutura

```
src/
  chess/       regras (independentes de render)
    moveGen.js   geração de lances e casas atacadas
    game.js      estado da partida, lances especiais, fim de jogo
    setup.js     zonas, validações e utilidades da montagem customizada
  three/       camada 3D
    boardScene.js  cena, luzes, tabuleiro, OrbitControls
    pieceModels.js modelos low poly de cada peça (fallback procedural)
    pieceGLB.js    modelos .glb embutidos (peão, bispo, rainha, rei), cores dos exércitos
    pieceAnimator.js caminhada procedural de peças com partes nomeadas
    highlights.js  marcadores de seleção/lances/xeque
    cameraRig.js   giro de câmera por turno
    cinematic.js   câmera lenta e aproximação nas capturas
    idleMotion.js  respiração das peças e tremor do rei em xeque
    specialFx.js   coroação, portões do roque e golpe furtivo
    replay.js      seleção e reprodução dos melhores momentos
    environment.js arena, campo de batalha, tochas, bandeiras e clima
    animation.js   utilidades de animação (tempo, easing, fade, reparent)
    combat.js      ataques, mortes e efeitos transitórios por tipo de peça
    decals.js      marcas persistentes no tabuleiro (limite e envelhecimento)
    gameView.js    liga regras, cena, cliques e animações
  ui/
    setupUI.js   tela 2D da montagem secreta
  audio/
    engine.js    AudioContext, barramentos, volume e carga de arquivos
    sfx.js       efeitos sintetizados por tipo de peça
    music.js     trilha ambiente procedural (ou arquivo próprio)
  settings.js  preferências (sangue/destroços, cinematográfica, volume, mudo)
  debug.js     montador de cenas de captura para conferir animações
  main.js      fluxo de telas (menu, montagem, revelação, partida)
```

## Modelos .glb e caminhada

Peças com modelo `.glb` ficam embutidas em base64 (`src/three/*Data.js`), já que o
host do artifact não serve `.glb`. Bispo, rainha e rei são gerados pelos scripts em
`tools/` (`create_bishop_glb.py`, `create_queen_glb.py`, `create_king_glb.py`, que
precisam de `numpy` e `trimesh`); depois de rodar um deles, regenere o
`*Data.js` correspondente a partir de `public/models/*.glb`.

Peão, bispo, rainha e rei dão passos ao se mover; torre e cavalo deslizam. Modelos
com pernas nomeadas andam de verdade (pernas alternadas, braços opostos, balanço,
inclinação e giro para a direção do lance). O peão, que é uma malha única, anda
bamboleando o corpo. As partes reconhecidas:

| Parte | Nomes aceitos |
|---|---|
| Pernas | `Leg_L`, `Leg_R` (com `Foot_*` e `Greave_*` acompanhando) |
| Braços | `Arm_L` / `Arm_L_Bent`, `Arm_R` / `Arm_R_Bent` (com `Hand_*` e `Cuff_*`) |
| Ombros (junta do braço, opcional) | `Shoulder_L`, `Shoulder_R` |
| Itens na mão (nome ou prefixo `Nome_`) | esquerda: `Holy_Orb`, `Golden_Orb`, `Orb`, `Shield`; direita: `Staff`, `Scepter`, `Sword`, `Weapon` |

## Usando seus próprios arquivos de som

O jogo funciona sem nenhum arquivo: todos os sons são sintetizados. Para
substituir qualquer um por áudio seu:

1. Coloque o arquivo em **`public/audio/`**.
2. Abra **`public/audio/manifest.json`** e escreva o nome do arquivo no id
   correspondente. Id vazio = continua sintetizado.

```json
{
  "attack_r": "ariete.ogg",
  "death_q": "coroa-caindo.ogg",
  "music_loop": "tema-guerra.ogg"
}
```

Ids disponíveis: `attack_*` e `death_*` e `step_*` (sufixos `p n b r q k`),
`music_loop`, `ui_check`, `ui_victory`, `ui_click`.

**Formato:** use **.ogg (Vorbis)** — melhor compressão e suportado por todos
os navegadores modernos. `.mp3` também serve; `.wav` só compensa nos efeitos
curtos, porque pesa muito mais.

**Duração e preparo recomendados:**

| Tipo | Duração | Observações |
|---|---|---|
| `attack_*` | 0,3 – 0,8 s | corte o silêncio inicial: o som dispara junto com o golpe |
| `death_*` | 0,8 – 1,5 s | a torre e o rei aguentam até ~2 s |
| `step_*` | 0,2 – 0,5 s | toca a cada lance, então evite algo marcante demais |
| `music_loop` | 60 – 120 s | precisa ser **loop perfeito** (o fim emenda no começo) |
| `ui_*` | 0,2 – 2 s | `ui_victory` pode ser mais longo |

Mono é suficiente para os efeitos (e gasta metade), estéreo faz sentido só na
música. 44,1 kHz, ~128 kbps para música e ~96 kbps para efeitos. Normalize os
efeitos para um pico parecido, senão uns sons vão soar muito mais altos que
os outros — há um limitador no fim da cadeia, mas ele não corrige mixagem
desequilibrada.

Arquivos que não carregam caem automaticamente no som sintetizado, com um
aviso no console.

## Conferindo as animações uma a uma

Com uma partida aberta, no console do navegador:

```js
xadrez.testarCaptura('atacante', 'vitima')
```

Os códigos são `p` (peão), `n` (cavalo), `b` (bispo), `r` (torre),
`q` (rainha) e `k` (rei). O comando monta uma posição em que a peça da Ordem
captura a da Ruína em d5 e executa o lance na hora. Exemplos:

```js
xadrez.testarCaptura('r', 'r')   // aríete da torre + desmoronamento em tijolos
xadrez.testarCaptura('n', 'q')   // pisoteio do cavalo + coroa rolando
xadrez.testarCaptura('b', 'p')   // feixe do bispo + peão largando o escudo
xadrez.testarCaptura('q', 'b')   // golpe giratório + cajado quebrado
xadrez.testarCaptura('k', 'n')   // investida do rei + cavalo tombando
xadrez.testarCaptura('q', 'k')   // demonstração visual da morte do rei
```

`window.xadrez` também expõe `{ game, gameView }` para inspeção.

Também dá para disparar sons soltos pelo console:

```js
xadrez.audio.playAttack('r')
xadrez.audio.playDeath('q')
xadrez.audio.playStep('n')
```
