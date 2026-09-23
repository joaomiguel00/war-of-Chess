// Vento nos tecidos: capa do rei, manto/faixa do bispo, vestido da rainha.
// Um deslocamento de vértices senoidal (tempo + posição no mundo) injetado
// no shader do próprio material; cresce da parte presa (em cima) para a
// barra solta. Todos os tecidos compartilham um só programa de shader e os
// mesmos uniforms globais de tempo/força, atualizados uma vez por quadro.

const CLOTH = /^(Cape|Cape_Edge_[LR]|Robe_Lower|Robe_Hem|Robe_Trim_\d+|Gown_Lower|Gown_Hem_Silver|Waist_Sash|Belt_Sash|Hood_Tip)$/;

const shared = {
  uWindTime: { value: 0 },
  uWindStrength: { value: 0.4 },
};

function patch(material, top, bottom, amplitude) {
  const own = {
    uClothTop: { value: top },
    uClothBottom: { value: bottom },
    uClothAmp: { value: amplitude },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWindTime;
uniform float uWindStrength;
uniform float uClothTop;
uniform float uClothBottom;
uniform float uClothAmp;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  float span = max(0.0001, uClothTop - uClothBottom);
  float loose = clamp((uClothTop - transformed.y) / span, 0.0, 1.0);
  loose *= loose;
  vec3 anchor = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float phase = uWindTime * 2.2 + anchor.x * 1.7 + anchor.z * 1.3 + transformed.y * 5.0;
  float sway = sin(phase) * 0.62 + sin(phase * 1.87 + 1.3) * 0.38;
  float flutter = sin(phase * 2.6 + transformed.x * 9.0) * 0.35;
  float amount = uWindStrength * loose * uClothAmp;
  transformed.x += sway * amount;
  transformed.z += (flutter + 0.35) * amount * 0.7;
}`,
      );
  };
  material.customProgramCacheKey = () => 'cloth-wind-v1';
  material.needsUpdate = true;
}

// Decorador de peça: marca os tecidos da peça recém-criada.
export function applyClothWind(piece) {
  piece.traverse((obj) => {
    if (!obj.isMesh || !CLOTH.test(obj.name) || obj.userData.clothWind) return;
    const geometry = obj.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    const height = max.y - min.y;
    obj.userData.clothWind = true;
    patch(obj.material, max.y, min.y, Math.max(0.018, height * 0.09));
  });
}

// strength: 0 (calmaria) a ~2 (vendaval). Chamado uma vez por quadro.
export function updateClothWind(elapsed, strength) {
  shared.uWindTime.value = elapsed;
  shared.uWindStrength.value = strength;
}
