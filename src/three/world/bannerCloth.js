import * as THREE from 'three';
import { drawEmblem } from '../../emblems.js';

// Pano de estandarte com o emblema do exército (acampamento e cemitério).
export const FLAG_COLOR = { w: 0xb8641e, b: 0x8a2aa0 };

export function drawFlag(canvas, color, emblemId) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, w, h);
  // Sujeira e desgaste.
  const grime = ctx.createLinearGradient(0, 0, 0, h);
  grime.addColorStop(0, 'rgba(0,0,0,0)');
  grime.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, h * 0.08, w, h * 0.05);
  ctx.fillRect(0, h * 0.87, w, h * 0.05);
  drawEmblem(ctx, emblemId, w * 0.52, h * 0.5, Math.min(w, h) * 0.72, 'rgba(240,226,190,0.95)');
}

// Canvas + textura prontos para receber drawFlag.
export function createFlagTexture(width = 256, height = 160) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}
