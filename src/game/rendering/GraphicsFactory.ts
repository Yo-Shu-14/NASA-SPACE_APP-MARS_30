import Phaser from 'phaser';
import { BuildingId, BuildingState } from '../../types/building';
import { EventPhenomenon } from '../../types/event';
import { PlantedCrop } from '../../types/game';

export const PALETTE = {
  marsRed: 0xb94f32,
  marsDark: 0x993e25,
  terracotta: 0xd77b4a,
  sand: 0xe9b77b,
  cream: 0xf1d8a8,
  creamLight: 0xfaf0dc,
  charcoal: 0x292c2b,
  lifeGreen: 0x718b78,
  lifeGreenBright: 0x89aa91,
  techBlue: 0x477c9b,
  techBlueLight: 0x6ca4c4,
  alertRed: 0xc94b43,
  shadow: 0x292c2b,
  wreckMetal: 0x5c534e,
  wreckDark: 0x423b37,
};

function lerpRgb(c1: number, c2: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return (r << 16) | (g << 8) | b;
}

function drawDebrisChunks(
  g: Phaser.GameObjects.Graphics,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
  cause?: EventPhenomenon | 'wear',
  severity?: 'minor' | 'major' | 'super_major'
) {
  const isMajor = severity === 'major' || severity === 'super_major';
  const isSuper = severity === 'super_major';

  // Broken structural hull plates & bent metal girders
  g.fillStyle(PALETTE.wreckDark, 1);
  g.lineStyle(2, PALETTE.charcoal, 1);
  g.fillRect(innerX + 6, innerY + innerH - 18, 14, 9);
  g.strokeRect(innerX + 6, innerY + innerH - 18, 14, 9);
  g.fillRect(innerX + innerW - 24, innerY + 8, 12, 10);
  g.strokeRect(innerX + innerW - 24, innerY + 8, 12, 10);

  if (isMajor) {
    // Buckled steel beam & collapsed roof girder protruding past silhouette
    g.fillStyle(PALETTE.wreckMetal, 1);
    g.fillRect(innerX + innerW * 0.36, innerY - 5, 22, 8);
    g.strokeRect(innerX + innerW * 0.36, innerY - 5, 22, 8);
    g.fillRect(innerX - 4, innerY + innerH * 0.42, 11, 16);
    g.strokeRect(innerX - 4, innerY + innerH * 0.42, 11, 16);
    // Diagonal snapped hull strut
    g.lineStyle(3.2, PALETTE.wreckMetal, 1);
    g.lineBetween(innerX + 10, innerY + 14, innerX + innerW - 12, innerY + innerH - 16);
    g.lineStyle(1.6, PALETTE.charcoal, 0.9);
    g.lineBetween(innerX + 12, innerY + 16, innerX + innerW - 10, innerY + innerH - 14);
  }
  if (isSuper) {
    g.fillStyle(PALETTE.wreckDark, 1);
    g.fillTriangle(
      innerX + innerW - 16,
      innerY + innerH - 6,
      innerX + innerW - 2,
      innerY + innerH - 26,
      innerX + innerW + 4,
      innerY + innerH - 3
    );
    g.strokeTriangle(
      innerX + innerW - 16,
      innerY + innerH - 6,
      innerX + innerW - 2,
      innerY + innerH - 26,
      innerX + innerW + 4,
      innerY + innerH - 3
    );
  }

  if (cause === 'solar_energetic_particles' || cause === 'secondary_neutron_cascades') {
    g.fillStyle(PALETTE.techBlueLight, 0.95);
    g.fillTriangle(
      innerX + innerW * 0.62,
      innerY + innerH - 12,
      innerX + innerW * 0.72,
      innerY + innerH - 22,
      innerX + innerW * 0.78,
      innerY + innerH - 9
    );
    g.fillStyle(0xf4c552, 0.95);
    g.fillCircle(innerX + innerW * 0.25, innerY + 14, 4.5);
  } else {
    g.fillStyle(PALETTE.terracotta, 0.92);
    g.fillCircle(innerX + innerW * 0.65, innerY + innerH - 14, isMajor ? 6 : 5);
    g.fillCircle(innerX + innerW * 0.25, innerY + 14, isMajor ? 5 : 4);
  }
}

function drawEventSpecificDamage(
  g: Phaser.GameObjects.Graphics,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
  cause: EventPhenomenon | 'wear' | undefined,
  heavy: boolean,
  severity?: 'minor' | 'major' | 'super_major'
) {
  const sev = severity ?? (heavy ? 'major' : 'minor');
  const isMajor = heavy || sev === 'major' || sev === 'super_major';
  const isSuper = sev === 'super_major';

  // Broken surface corner breach + exposed dark hull interior for damaged/destroyed structures
  if (isMajor) {
    g.fillStyle(0x1e1d1c, 0.9);
    g.fillTriangle(innerX + 2, innerY + 2, innerX + 26, innerY + 2, innerX + 2, innerY + 24);
    g.lineStyle(2.4, PALETTE.charcoal, 1);
    g.lineBetween(innerX + 26, innerY + 2, innerX + 13, innerY + 14);
    g.lineBetween(innerX + 13, innerY + 14, innerX + 2, innerY + 24);
    // Central punctured hull gash so even repaired-to-damaged structures clearly show destruction
    g.fillStyle(0x23201f, 0.78);
    g.fillTriangle(
      innerX + innerW * 0.44,
      innerY + innerH * 0.36,
      innerX + innerW * 0.64,
      innerY + innerH * 0.44,
      innerX + innerW * 0.49,
      innerY + innerH * 0.62
    );
    g.lineStyle(2, PALETTE.wreckMetal, 0.9);
    g.lineBetween(
      innerX + innerW * 0.42,
      innerY + innerH * 0.46,
      innerX + innerW * 0.64,
      innerY + innerH * 0.49
    );
  }
  if (isSuper) {
    g.fillStyle(0x1e1d1c, 0.92);
    g.fillTriangle(
      innerX + innerW - 2,
      innerY + innerH - 2,
      innerX + innerW - 28,
      innerY + innerH - 2,
      innerX + innerW - 2,
      innerY + innerH - 26
    );
  }

  if (cause === 'marsquake') {
    // Deep jagged tectonic cracks + displaced concrete/regolith rubble fragments
    g.fillStyle(PALETTE.wreckDark, 0.92);
    g.fillRect(innerX + 8, innerY + innerH - 16, 12, 8);
    g.fillRect(innerX + innerW - 26, innerY + 10, 10, 7);
    if (isMajor) {
      g.fillRect(innerX + innerW * 0.45, innerY + innerH - 13, 13, 7);
      g.fillRect(innerX + innerW * 0.56, innerY + 14, 9, 6);
    }
    g.fillStyle(PALETTE.terracotta, 0.94);
    g.fillCircle(innerX + 24, innerY + innerH - 10, 4.2);
    g.fillCircle(innerX + innerW - 16, innerY + innerH - 16, 5);

    // Primary splitting chasm crack
    g.lineStyle(isSuper ? 4.5 : isMajor ? 3.8 : 3, PALETTE.charcoal, 0.98);
    g.lineBetween(innerX + 6, innerY + 8, innerX + innerW * 0.36, innerY + innerH * 0.44);
    g.lineBetween(innerX + innerW * 0.36, innerY + innerH * 0.44, innerX + innerW * 0.22, innerY + innerH * 0.78);
    g.lineBetween(innerX + innerW * 0.36, innerY + innerH * 0.44, innerX + innerW * 0.68, innerY + innerH * 0.56);
    g.lineBetween(innerX + innerW - 8, innerY + innerH - 10, innerX + innerW * 0.62, innerY + innerH * 0.58);
    if (isMajor) {
      g.lineBetween(innerX + innerW * 0.62, innerY + innerH * 0.58, innerX + innerW * 0.76, innerY + 14);
      g.lineBetween(innerX + innerW * 0.28, innerY + innerH * 0.66, innerX + 12, innerY + innerH * 0.68);
    }
    g.lineStyle(1.8, 0x9e513b, 0.72);
    g.lineBetween(innerX + 9, innerY + 10, innerX + innerW * 0.35, innerY + innerH * 0.45);
    return;
  }

  if (cause === 'solar_storm_response' || cause === 'solar_flare_xray_uv') {
    // Charred scorch blotches, singed plating & glowing burnt thermal cracks
    const blotchScale = isSuper ? 1.35 : isMajor ? 1.15 : 0.9;
    g.fillStyle(PALETTE.charcoal, isSuper ? 0.64 : isMajor ? 0.52 : 0.36);
    g.fillEllipse(innerX + innerW * 0.32, innerY + innerH * 0.35, 36 * blotchScale, 22 * blotchScale);
    g.fillEllipse(innerX + innerW * 0.72, innerY + innerH * 0.68, 28 * blotchScale, 18 * blotchScale);
    if (isMajor) {
      g.fillEllipse(innerX + innerW * 0.64, innerY + innerH * 0.28, 24, 15);
    }
    g.fillStyle(0xf59e0b, isSuper ? 0.44 : isMajor ? 0.36 : 0.24);
    g.fillEllipse(innerX + innerW * 0.32, innerY + innerH * 0.35, 18 * blotchScale, 10 * blotchScale);

    // Thermal fracture web
    g.lineStyle(isMajor ? 2.8 : 2.2, 0xea580c, 0.94);
    g.lineBetween(innerX + 10, innerY + 14, innerX + 30, innerY + 28);
    g.lineBetween(innerX + 30, innerY + 28, innerX + 18, innerY + 46);
    g.lineBetween(innerX + 30, innerY + 28, innerX + 42, innerY + 22);
    if (isMajor) {
      g.lineBetween(innerX + innerW - 12, innerY + innerH - 12, innerX + innerW - 34, innerY + innerH - 30);
      g.lineBetween(innerX + innerW - 34, innerY + innerH - 30, innerX + innerW - 22, innerY + innerH - 44);
    }
    return;
  }

  if (cause === 'solar_energetic_particles' || cause === 'secondary_neutron_cascades') {
    // Blown circuit burn craters, snapped sparking wires & shattered casing shards
    g.fillStyle(0x1f2438, isSuper ? 0.58 : isMajor ? 0.46 : 0.32);
    g.fillCircle(innerX + innerW * 0.68, innerY + innerH * 0.36, isMajor ? 16 : 13);
    if (isMajor) {
      g.fillCircle(innerX + innerW * 0.3, innerY + innerH * 0.7, 13);
    }
    g.lineStyle(2.4, 0x8be2ff, 0.95);
    g.lineBetween(innerX + innerW * 0.56, innerY + innerH * 0.34, innerX + innerW * 0.7, innerY + innerH * 0.22);
    g.lineBetween(innerX + innerW * 0.7, innerY + innerH * 0.22, innerX + innerW * 0.8, innerY + innerH * 0.44);
    g.lineStyle(2.4, 0xf4c552, 0.95);
    g.lineBetween(innerX + 12, innerY + innerH - 16, innerX + 25, innerY + innerH - 28);
    g.lineBetween(innerX + 25, innerY + innerH - 28, innerX + 34, innerY + innerH - 13);
    if (isMajor) {
      g.lineBetween(innerX + innerW * 0.35, innerY + 16, innerX + innerW * 0.48, innerY + 26);
    }
    g.fillStyle(PALETTE.techBlueLight, 0.95);
    g.fillTriangle(innerX + 12, innerY + 12, innerX + 26, innerY + 18, innerX + 15, innerY + 28);
    return;
  }

  if (cause === 'global_dust_storm' || cause === 'dust_devils') {
    // Heavy piled terracotta sandbanks + buried lower trim + wind-gouged hull scratches & pebbles
    const driftScale = isSuper ? 1.35 : isMajor ? 1.15 : 0.92;
    g.fillStyle(PALETTE.terracotta, isSuper ? 0.88 : isMajor ? 0.78 : 0.6);
    g.fillEllipse(innerX + innerW * 0.28, innerY + innerH - 7, 38 * driftScale, 15 * driftScale);
    g.fillEllipse(innerX + innerW * 0.72, innerY + innerH - 5, 34 * driftScale, 13 * driftScale);
    if (isSuper) {
      g.fillEllipse(innerX + innerW * 0.5, innerY + innerH - 4, innerW * 0.86, 16);
    }
    g.fillStyle(PALETTE.sand, isSuper ? 0.84 : isMajor ? 0.74 : 0.56);
    g.fillEllipse(innerX + innerW * 0.26, innerY + innerH - 9, 24 * driftScale, 9 * driftScale);
    g.fillEllipse(innerX + innerW * 0.7, innerY + innerH - 7, 20 * driftScale, 8);
    // Scattered storm rocks & grit
    g.fillStyle(PALETTE.marsDark, 0.9);
    g.fillCircle(innerX + innerW * 0.64, innerY + 18, 5);
    g.fillCircle(innerX + 18, innerY + 22, 4.5);
    if (isMajor) {
      g.fillCircle(innerX + innerW * 0.44, innerY + innerH * 0.48, 4);
    }
    // Wind-ripped scratches & bent plates
    g.lineStyle(isMajor ? 2.6 : 2, PALETTE.marsDark, 0.9);
    g.lineBetween(innerX + 10, innerY + 16, innerX + 38, innerY + 26);
    g.lineBetween(innerX + innerW - 38, innerY + innerH - 30, innerX + innerW - 12, innerY + innerH - 20);
    if (isMajor) {
      g.lineBetween(innerX + 14, innerY + innerH * 0.48, innerX + innerW * 0.52, innerY + innerH * 0.54);
    }
    return;
  }

  if (cause === 'water_ice_clouds') {
    // Frost-chilled blue-white ice patches, icicle wedges & cold stress fractures
    g.fillStyle(0xdcf4ff, isMajor ? 0.74 : 0.52);
    g.fillEllipse(innerX + 22, innerY + 18, 24, 14);
    g.fillEllipse(innerX + innerW - 22, innerY + innerH - 16, 26, 14);
    if (isMajor) {
      g.fillEllipse(innerX + innerW * 0.54, innerY + 16, 20, 10);
    }
    g.lineStyle(2.5, 0x8be2ff, 0.95);
    g.lineBetween(innerX + 12, innerY + 12, innerX + 28, innerY + 28);
    g.lineBetween(innerX + 28, innerY + 28, innerX + 18, innerY + 44);
    g.lineBetween(innerX + 28, innerY + 28, innerX + 40, innerY + 24);
    return;
  }

  // Default wear cracks & structural dents
  g.fillStyle(PALETTE.charcoal, isMajor ? 0.34 : 0.18);
  g.fillEllipse(innerX + innerW * 0.28, innerY + innerH * 0.36, 30, 18);

  g.lineStyle(isMajor ? 3.2 : 2.5, isMajor ? 0x6b4536 : PALETTE.charcoal, 0.92);
  g.lineBetween(innerX + 10, innerY + 12, innerX + 26, innerY + 28);
  g.lineBetween(innerX + 26, innerY + 28, innerX + 18, innerY + 46);
  g.lineBetween(innerX + 26, innerY + 28, innerX + 38, innerY + 24);
  if (isMajor) {
    g.lineBetween(innerX + innerW - 14, innerY + innerH - 14, innerX + innerW - 34, innerY + innerH - 30);
    g.lineBetween(innerX + innerW - 34, innerY + innerH - 30, innerX + innerW - 26, innerY + innerH - 46);
  }
}

export interface BuildingDrawExtra {
  inShelter?: boolean;
  isSleeping?: boolean;
  isRepairing?: boolean;
  isLocked?: boolean;
  repairTaskKind?: 'restore' | 'repair' | 'clean' | 'plant' | 'harvest';
  hasPower?: boolean;
  solarOutputFactor?: number;
  storageCurrent?: number;
  storageCapacity?: number;
  hasActiveCrop?: boolean;
  shadowDx?: number;
  shadowDy?: number;
  shadowAlpha?: number;
  shadowColor?: number;
  nightFactor?: number;
  sunBias?: number;
  rimColor?: number;
  rimAlpha?: number;
}

function drawStatusLed(
  g: Phaser.GameObjects.Graphics,
  lx: number,
  ly: number,
  isInactive: boolean,
  isDamaged: boolean,
  isOperational: boolean,
  animPhase: number,
  activeColor = PALETTE.lifeGreenBright,
  radius = 3.2
) {
  g.lineStyle(1.5, PALETTE.charcoal, 1);
  if (isInactive) {
    g.fillStyle(0x2f3335, 1);
    g.fillCircle(lx, ly, radius);
    g.strokeCircle(lx, ly, radius);
    return;
  }
  if (isDamaged) {
    const flicker = 0.45 + 0.45 * Math.sin(animPhase * 7.5 + lx);
    g.fillStyle(0xd99b52, flicker);
    g.fillCircle(lx, ly, radius);
    g.strokeCircle(lx, ly, radius);
    return;
  }
  if (isOperational) {
    const pulse = 0.7 + 0.3 * Math.sin(animPhase * 3.4 + lx * 0.1);
    g.fillStyle(activeColor, pulse);
    g.fillCircle(lx, ly, radius);
    g.strokeCircle(lx, ly, radius);
  }
}

export function drawBuildingGraphics(
  g: Phaser.GameObjects.Graphics,
  id: BuildingId,
  width: number,
  height: number,
  state: BuildingState,
  crop: PlantedCrop | null,
  animPhase = 0,
  extra?: BuildingDrawExtra
) {
  g.clear();

  const pad = 6;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = -width / 2 + pad;
  const y = -height / 2 + pad;

  const isInactive = state.status === 'inactive';
  const isDamaged = state.status === 'damaged';
  const isOperational = state.status === 'operational';
  const hasPower = extra?.hasPower ?? true;
  const isRepairing = Boolean(extra?.isRepairing);
  const nightFactor = extra?.nightFactor ?? 0;
  const sunBias = extra?.sunBias ?? 0;

  const storageCap = Math.max(1, extra?.storageCapacity ?? 100);
  const storageCur = Math.max(0, extra?.storageCurrent ?? 0);
  const storageRatio = Math.max(0, Math.min(1, storageCur / storageCap));
  const isNearCap = !isInactive && storageRatio >= 0.85;
  const isFullCap = !isInactive && storageRatio >= 0.99;

  // Soft two-pass color-graded directional shadow (cool violet/indigo shadows for warm/cool depth)
  const shadowDx = extra?.shadowDx ?? 4;
  const shadowDy = extra?.shadowDy ?? 6;
  const baseShadowAlpha = extra?.shadowAlpha ?? 0.32;
  const shadowColor = extra?.shadowColor ?? PALETTE.shadow;
  const effectiveShadowAlpha = isInactive ? baseShadowAlpha * 0.62 : baseShadowAlpha;
  g.fillStyle(shadowColor, effectiveShadowAlpha * 0.42);
  g.fillRoundedRect(x + shadowDx * 1.25 - 2, y + shadowDy * 1.25 - 1, w + 4, h + 3, 12);
  g.fillStyle(shadowColor, effectiveShadowAlpha);
  g.fillRoundedRect(x + shadowDx, y + shadowDy, w, h, 10);

  // Foundation pad (weathered slate-brown border when inactive/damaged, charcoal when operational)
  g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? 0x776b64 : 0x9d9187, 1);
  g.lineStyle(2.5, isInactive ? 0x4b4643 : isDamaged ? 0x6e584b : PALETTE.charcoal, 1);
  g.fillRoundedRect(x, y, w, h, 8);
  g.strokeRoundedRect(x, y, w, h, 8);

  // Directional sunlight rim during day/sunset, blending smoothly to cool ambient moonlight rim at night
  const rimAlpha = (extra?.rimAlpha ?? 0.32) * (isInactive ? 0.55 : 1);
  const rimColor = extra?.rimColor ?? 0xffe4b5;
  if (rimAlpha > 0.02) {
    g.lineStyle(3, rimColor, rimAlpha);
    if (nightFactor >= 0.55) {
      g.lineBetween(x + 6, y + 2, x + w - 6, y + 2);
      g.lineBetween(x + 2, y + 6, x + 2, y + h * 0.72);
    } else if (sunBias <= -0.15) {
      g.lineBetween(x + w - 2, y + 6, x + w - 2, y + h - 6);
      g.lineBetween(x + w * 0.35, y + 2, x + w - 6, y + 2);
    } else if (sunBias >= 0.15) {
      g.lineBetween(x + 2, y + 6, x + 2, y + h - 6);
      g.lineBetween(x + 6, y + 2, x + w * 0.65, y + 2);
    } else {
      g.lineBetween(x + 6, y + 2, x + w - 6, y + 2);
    }
  }

  const innerX = x + 6;
  const innerY = y + 6;
  const innerW = w - 12;
  const innerH = h - 12;

  switch (id) {
    case 'main_habitat': {
      // Pressurized cozy Mars dome habitat with cutaway crew sleeping quarters
      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0xcfc1a7 : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 20);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 20);

      // Inner dome structural rim
      g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? 0xd9cdb6 : PALETTE.creamLight, 1);
      g.lineStyle(2, PALETTE.charcoal, isInactive ? 0.45 : 0.7);
      g.fillRoundedRect(innerX + 8, innerY + 8, innerW - 16, innerH - 22, 15);
      g.strokeRoundedRect(innerX + 8, innerY + 8, innerW - 16, innerH - 22, 15);

      // Rooftop thermal ribs
      g.fillStyle(isInactive ? 0x564e49 : isDamaged ? PALETTE.terracotta : PALETTE.sand, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + 16, innerY + 13, innerW - 48, 11, 4);
      g.strokeRoundedRect(innerX + 16, innerY + 13, innerW - 48, 11, 4);

      const windowGlowStrength = Math.max(nightFactor, extra?.isSleeping ? 0.94 : 0);

      // Cutaway Pressurized Crew Quarters Bay revealing 5 designated sleeping beds
      const bayX = innerX + 14;
      const bayY = innerY + 30;
      const bayW = innerW - 28;
      const bayH = innerH - 64;
      const floorColor = isInactive
        ? 0x35393b
        : isDamaged
        ? 0x9b8e78
        : 0xe6d1ab;

      g.fillStyle(floorColor, 1);
      g.lineStyle(2.2, PALETTE.charcoal, 1);
      g.fillRoundedRect(bayX, bayY, bayW, bayH, 12);
      g.strokeRoundedRect(bayX, bayY, bayW, bayH, 12);

      // Warm interior cabin floor rug & central aisle down to the airlock
      if (!isInactive) {
        g.fillStyle(isDamaged ? 0x7b6a58 : 0xc79565, 0.55);
        g.fillRoundedRect(innerX + innerW / 2 - 14, bayY + 34, 28, bayH - 36, 6);
        if (windowGlowStrength > 0.12) {
          g.fillStyle(0xffd97d, windowGlowStrength * (isOperational ? 0.24 : 0.12));
          g.fillRoundedRect(bayX + 2, bayY + 2, bayW - 4, bayH - 4, 10);
        }
      }

      const drawCrewBed = (
        cx: number,
        cy: number,
        bw: number,
        bh: number,
        blanketColor: number,
        horizontal = false
      ) => {
        const bx = cx - bw / 2;
        const by = cy - bh / 2;
        const frameColor = isInactive ? PALETTE.wreckDark : isDamaged ? 0x6f655d : 0x564c45;
        const pillowColor = isInactive ? 0x6d6a66 : PALETTE.creamLight;
        const blanketCol = isInactive ? 0x4f4c49 : isDamaged ? lerpRgb(blanketColor, 0x766e68, 0.45) : blanketColor;

        // Subtle bed shadow
        g.fillStyle(PALETTE.charcoal, 0.22);
        g.fillRoundedRect(bx + 1.5, by + 2, bw, bh, 5);

        // Bed frame
        g.fillStyle(frameColor, 1);
        g.lineStyle(1.8, PALETTE.charcoal, 1);
        g.fillRoundedRect(bx, by, bw, bh, 5);
        g.strokeRoundedRect(bx, by, bw, bh, 5);

        if (horizontal) {
          // Headboard rail on left
          g.fillStyle(isInactive ? 0x3b3836 : PALETTE.sand, 1);
          g.fillRoundedRect(bx + 1.5, by + 2, 4.5, bh - 4, 2);

          // Crisp pillow on left side
          g.fillStyle(pillowColor, 1);
          g.lineStyle(1.3, PALETTE.charcoal, 0.85);
          g.fillRoundedRect(bx + 6.5, by + 4, 9, bh - 8, 3);
          g.strokeRoundedRect(bx + 6.5, by + 4, 9, bh - 8, 3);

          // Folded sheet cuff + colored blanket on right 2/3
          g.fillStyle(blanketCol, 1);
          g.lineStyle(1.4, PALETTE.charcoal, 0.9);
          g.fillRoundedRect(bx + 16, by + 2.5, bw - 18.5, bh - 5, 3);
          g.strokeRoundedRect(bx + 16, by + 2.5, bw - 18.5, bh - 5, 3);

          g.fillStyle(pillowColor, 0.95);
          g.fillRect(bx + 15.5, by + 3.2, 4, bh - 6.4);

          if (!isInactive && extra?.isSleeping) {
            // Tucked-in sleeper silhouette & bedside nightlight glow
            g.fillStyle(0xf4c7a1, 0.95);
            g.fillCircle(bx + 11, cy, 4);
            g.fillStyle(0xffd97d, 0.95);
            g.fillCircle(bx + 3.5, by + 4, 2.2);
          }
        } else {
          // Headboard rail at top
          g.fillStyle(isInactive ? 0x3b3836 : PALETTE.sand, 1);
          g.fillRoundedRect(bx + 2, by + 1.5, bw - 4, 4.5, 2);

          // Crisp pillow at top
          g.fillStyle(pillowColor, 1);
          g.lineStyle(1.3, PALETTE.charcoal, 0.85);
          g.fillRoundedRect(bx + 4, by + 6.5, bw - 8, 9, 3);
          g.strokeRoundedRect(bx + 4, by + 6.5, bw - 8, 9, 3);

          // Colored blanket + folded top sheet cuff
          g.fillStyle(blanketCol, 1);
          g.lineStyle(1.4, PALETTE.charcoal, 0.9);
          g.fillRoundedRect(bx + 2.5, by + 16, bw - 5, bh - 18.5, 3);
          g.strokeRoundedRect(bx + 2.5, by + 16, bw - 5, bh - 18.5, 3);

          g.fillStyle(pillowColor, 0.95);
          g.fillRect(bx + 3.2, by + 15.5, bw - 6.4, 4);

          if (!isInactive && extra?.isSleeping) {
            // Tucked-in sleeper head & warm bedside lamp
            g.fillStyle(0xf4c7a1, 0.95);
            g.fillCircle(cx, by + 11, 4);
            g.fillStyle(0xffd97d, 0.95);
            g.fillCircle(bx + 4, by + 3.5, 2.2);
          }
        }
      };

      // 5 Designated Crew Beds matching crew colors (You, Brent, MJ, Darryl, Magno)
      const cxMid = innerX + innerW / 2;
      const cyMid = innerY + innerH / 2;
      drawCrewBed(cxMid - 54, cyMid - 34, 26, 38, PALETTE.marsRed); // You (Commander)
      drawCrewBed(cxMid - 54, cyMid + 18, 26, 38, PALETTE.terracotta); // Brent
      drawCrewBed(cxMid + 54, cyMid - 34, 26, 38, PALETTE.lifeGreen); // MJ
      drawCrewBed(cxMid + 54, cyMid + 18, 26, 38, PALETTE.techBlue); // Darryl
      drawCrewBed(cxMid, cyMid - 44, 42, 22, 0x9e6a44, true); // Magno (Top Mezzanine Bunk)

      // Central circular skylight commons hub between the sleeping bays
      if (innerW >= 150 && innerH >= 150) {
        const skyR = 16;
        const skyX = cxMid;
        const skyY = cyMid + 6;
        g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
        g.lineStyle(2, PALETTE.charcoal, 1);
        g.fillCircle(skyX, skyY, skyR + 3.5);
        g.strokeCircle(skyX, skyY, skyR + 3.5);
        const atriumColor = isInactive
          ? 0x35393b
          : isDamaged
          ? windowGlowStrength > 0.25
            ? 0xb8864b
            : 0x5d7482
          : windowGlowStrength > 0.25
          ? 0xffd97d
          : PALETTE.techBlueLight;
        g.fillStyle(atriumColor, 1);
        g.fillCircle(skyX, skyY, skyR);
        g.strokeCircle(skyX, skyY, skyR);
        g.lineStyle(1.5, PALETTE.charcoal, 0.55);
        g.lineBetween(skyX - skyR + 3, skyY, skyX + skyR - 3, skyY);
        g.lineBetween(skyX, skyY - skyR + 3, skyX, skyY + skyR - 3);
      }

      // Subtle translucent dome skylight tint & reflection glint over the crew quarters
      if (!isInactive) {
        g.fillStyle(0xdcf4ff, isOperational ? 0.14 : 0.08);
        g.fillRoundedRect(bayX + 2, bayY + 2, bayW - 4, bayH - 4, 10);
        g.lineStyle(1.8, 0xffffff, isOperational ? 0.42 : 0.2);
        g.lineBetween(bayX + 10, bayY + 16, bayX + 24, bayY + 6);
        g.lineBetween(bayX + 18, bayY + 22, bayX + 34, bayY + 9);
      }

      // Illuminated circular porthole windows flanking the front airlock
      const winColor = isOperational
        ? windowGlowStrength > 0.25
          ? 0xffd97d
          : PALETTE.techBlueLight
        : isDamaged
        ? windowGlowStrength > 0.3
          ? 0xc48b48
          : 0x576a75
        : 0x34383a;
      const portY = innerY + innerH - 20;
      if (!isInactive && windowGlowStrength > 0.1) {
        const glowAlpha = windowGlowStrength * (isOperational ? 0.42 : 0.2);
        g.fillStyle(0xffd97d, glowAlpha);
        g.fillCircle(innerX + 26, portY, 14);
        g.fillCircle(innerX + innerW - 26, portY, 14);
      }
      g.fillStyle(winColor, 1);
      g.lineStyle(2.2, PALETTE.charcoal, 1);
      g.fillCircle(innerX + 26, portY, 9);
      g.strokeCircle(innerX + 26, portY, 9);
      g.fillCircle(innerX + innerW - 26, portY, 9);
      g.strokeCircle(innerX + innerW - 26, portY, 9);

      if (isOperational) {
        g.fillStyle(0xffffff, 0.75);
        g.fillCircle(innerX + 23.5, portY - 2.5, 2.5);
        g.fillCircle(innerX + innerW - 28.5, portY - 2.5, 2.5);
      }

      // Front pressurized airlock door + status trim + warm night porch glow
      if (!isInactive && nightFactor > 0.15) {
        g.fillStyle(0xffd269, nightFactor * (isOperational ? 0.32 : 0.15));
        g.fillRoundedRect(innerX + innerW / 2 - 20, innerY + innerH - 28, 40, 28, 8);
      }
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.marsRed, 1);
      g.lineStyle(2.2, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + innerW / 2 - 14, innerY + innerH - 24, 28, 22, 5);
      g.strokeRoundedRect(innerX + innerW / 2 - 14, innerY + innerH - 24, 28, 22, 5);
      g.fillStyle(isInactive ? 0x484442 : isDamaged ? 0xd99b52 : 0xf4c552, 1);
      g.fillRect(innerX + innerW / 2 - 10, innerY + innerH - 8, 20, 4);
      drawStatusLed(g, innerX + innerW / 2 + 18, innerY + innerH - 12, isInactive, isDamaged, isOperational, animPhase);

      // Comms radar dish with rotating scanner arm when operational
      const dishX = innerX + innerW - 22;
      const dishY = innerY + 23;
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.creamLight, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillCircle(dishX, dishY, 10.5);
      g.strokeCircle(dishX, dishY, 10.5);
      if (isOperational) {
        const radarA = animPhase * 2.1;
        g.lineStyle(2, PALETTE.techBlue, 0.85);
        g.lineBetween(dishX, dishY, dishX + Math.cos(radarA) * 8, dishY + Math.sin(radarA) * 8);
        const pulse = 0.55 + 0.45 * Math.sin(animPhase * 3.2);
        g.fillStyle(PALETTE.lifeGreenBright, 0.5 + pulse * 0.5);
        g.fillCircle(dishX, dishY, 3.8);
      } else if (isDamaged) {
        g.lineStyle(1.8, PALETTE.charcoal, 0.7);
        g.lineBetween(dishX, dishY, dishX - 6, dishY + 5);
        g.fillStyle(0xd99b52, 0.8);
        g.fillCircle(dishX, dishY, 3.2);
      } else {
        g.fillStyle(0x2f3335, 1);
        g.fillCircle(dishX, dishY, 3);
      }
      break;
    }

    case 'solar_panels': {
      // Support rail frame + junction box
      g.fillStyle(isInactive ? 0x363331 : PALETTE.wreckDark, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 6);

      // Junction box on right edge with active power meter & LED
      const jBoxH = Math.min(28, Math.max(16, innerH - 10));
      const jBoxX = innerX + innerW - 14;
      const jBoxY = innerY + (innerH - jBoxH) * 0.5;
      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0x9c6b4d : PALETTE.terracotta, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRoundedRect(jBoxX, jBoxY, 14, jBoxH, 3);
      g.strokeRoundedRect(jBoxX, jBoxY, 14, jBoxH, 3);

      const cols = innerH < 72 ? 4 : 3;
      const rows = innerH < 72 ? 1 : 2;
      const cellW = (innerW - 20) / cols;
      const cellH = (innerH - 8 - (rows - 1) * 2) / rows;

      const dayGlow = Math.max(0, 1 - nightFactor * 1.45);
      const solarFactor = extra?.solarOutputFactor ?? (isOperational ? dayGlow * Math.max(0.25, 1 - state.dustLevel / 110) : 0);
      const panelNightTone = lerpRgb(PALETTE.techBlue, 0x242f4f, Math.min(1, nightFactor * 1.15));
      const gridLineColor = lerpRgb(PALETTE.techBlueLight, 0x455a85, Math.min(1, nightFactor * 1.1));
      const gridLineAlpha = 0.36 + 0.44 * dayGlow;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = innerX + 4 + c * (cellW + 2);
          const py = innerY + 4 + r * (cellH + 2);

          if (isInactive && (r + c) % 2 === 0) {
            // Broken missing cell showing exposed frame & dead wire
            g.lineStyle(2, PALETTE.wreckMetal, 1);
            g.strokeRect(px + 2, py + 2, cellW - 6, cellH - 6);
            g.lineBetween(px + 2, py + 2, px + cellW - 4, py + cellH - 4);
            g.lineStyle(1.8, 0x70655d, 0.85);
            g.lineBetween(px + 6, py + cellH / 2, px + 14, py + cellH / 2 - 4);
            continue;
          }

          if (isInactive) {
            g.fillStyle(0x464b4e, 1);
          } else if (isDamaged && ((rows === 1 && c === 2) || (rows > 1 && r === 1 && c === 1))) {
            g.fillStyle(0x524944, 1);
          } else {
            g.fillStyle(panelNightTone, 1);
          }

          g.fillRect(px, py, cellW - 2, cellH - 2);
          g.lineStyle(2, PALETTE.charcoal, 1);
          g.strokeRect(px, py, cellW - 2, cellH - 2);

          if (!isInactive) {
            g.lineStyle(1.3, gridLineColor, gridLineAlpha);
            g.lineBetween(px + 3, py + cellH * 0.33, px + cellW - 5, py + cellH * 0.33);
            g.lineBetween(px + 3, py + cellH * 0.66, px + cellW - 5, py + cellH * 0.66);
            g.lineBetween(px + cellW * 0.5, py + 3, px + cellW * 0.5, py + cellH - 5);

            // Animated sunlight energy wave sweeping across active cells
            if (isOperational && state.dustLevel < 45 && dayGlow > 0.05) {
              const wave = 0.5 + 0.5 * Math.sin(animPhase * 2.8 - c * 0.9 - r * 0.5);
              const dustDamp = Math.max(0.2, 1 - state.dustLevel / 55);
              const glintColor = sunBias > 0.25 ? 0xffd69e : 0xbbeeff;
              g.lineStyle(2.2, glintColor, wave * 0.62 * dayGlow * dustDamp);
              g.lineBetween(px + 4, py + 4, px + cellW - 8, py + cellH - 8);
              // Subtle energized cell shimmer
              g.fillStyle(0x8be2ff, wave * 0.14 * dayGlow * dustDamp);
              g.fillRect(px + 2, py + 2, cellW - 6, cellH - 6);
            }
          }
        }
      }

      // Junction box live output LED & 3-segment power meter
      drawStatusLed(
        g,
        jBoxX + 7,
        jBoxY + 5,
        isInactive,
        isDamaged || state.dustLevel >= 35,
        isOperational,
        animPhase,
        solarFactor > 0.15 ? PALETTE.lifeGreenBright : 0x6ca4c4,
        2.8
      );
      if (!isInactive) {
        const activeBars = isOperational ? Math.max(1, Math.round(solarFactor * 3)) : 1;
        for (let b = 0; b < 3; b++) {
          const lit = b < activeBars;
          g.fillStyle(lit ? (isDamaged ? 0xd99b52 : 0xf4c552) : 0x35383a, 1);
          g.fillRect(jBoxX + 3, jBoxY + jBoxH - 5 - b * 4, 8, 2.5);
        }
      }

      // Red dust film + speckles proportional to dustLevel
      if (state.dustLevel > 10) {
        const dustAlpha = Math.min(0.74, (state.dustLevel / 100) * 0.74);
        g.fillStyle(PALETTE.terracotta, dustAlpha);
        g.fillRoundedRect(innerX, innerY, innerW - 10, innerH, 6);
        g.fillStyle(PALETTE.marsDark, Math.min(0.65, dustAlpha));
        g.fillCircle(innerX + 24, innerY + innerH * 0.42, 5.5);
        g.fillCircle(innerX + innerW - 36, innerY + innerH * 0.58, 7);
        g.fillCircle(innerX + innerW * 0.48, innerY + innerH * 0.48, 5);
      }
      break;
    }

    case 'energy_storage': {
      // Copper battery terminal caps on top (amber highlight when near capacity!)
      const capColor = isInactive
        ? PALETTE.wreckDark
        : isNearCap
        ? 0xf4c552
        : 0xe9b77b;
      g.fillStyle(capColor, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + 8, innerY - 2, 12, 7, 2);
      g.strokeRoundedRect(innerX + 8, innerY - 2, 12, 7, 2);
      g.fillRoundedRect(innerX + innerW - 20, innerY - 2, 12, 7, 2);
      g.strokeRoundedRect(innerX + innerW - 20, innerY - 2, 12, 7, 2);

      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0xd6c7ac : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY + 3, innerW, innerH - 3, 6);
      g.strokeRoundedRect(innerX, innerY + 3, innerW, innerH - 3, 6);

      // 3 Battery Cells reflecting actual storage fullness bottom-to-top
      const barH = (innerH - 28) / 3;
      const cellThresholds = [0.66, 0.33, 0.05]; // top, middle, bottom
      for (let i = 0; i < 3; i++) {
        const by = innerY + 11 + i * (barH + 4);
        const cellBroken = (isInactive && i < 2) || (isDamaged && i === 0);
        if (cellBroken) {
          g.fillStyle(PALETTE.wreckDark, 1);
          g.fillRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
          g.strokeRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
        } else if (isInactive) {
          g.fillStyle(0x4a5054, 1);
          g.fillRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
          g.strokeRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
        } else {
          const isCharged = storageRatio >= cellThresholds[i];
          const fillColor = isCharged
            ? isNearCap
              ? 0xf4c552
              : PALETTE.techBlue
            : 0x3b464d;
          g.fillStyle(fillColor, 1);
          g.fillRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
          g.strokeRoundedRect(innerX + 6, by, innerW - 12, barH, 4);
          if (isOperational && isCharged) {
            const glow = 0.65 + 0.35 * Math.sin(animPhase * 3 + i * 0.9);
            g.fillStyle(isNearCap ? 0xfff3c4 : 0xf4c552, glow);
            g.fillRoundedRect(innerX + 10, by + 5, innerW - 20, 6, 2);
          }
        }
      }

      // Status LED + near-capacity limit rim indicator
      drawStatusLed(
        g,
        innerX + innerW / 2,
        innerY + 6,
        isInactive,
        isDamaged,
        isOperational,
        animPhase,
        isNearCap ? 0xf4c552 : PALETTE.lifeGreenBright,
        2.8
      );
      if (isNearCap) {
        const capPulse = 0.6 + 0.4 * Math.sin(animPhase * 4.2);
        g.lineStyle(2.5, isFullCap ? 0xf4c552 : 0xe9b77b, capPulse);
        g.strokeRoundedRect(innerX + 2, innerY + 5, innerW - 4, innerH - 7, 5);
      }
      break;
    }

    case 'oxygen_generator': {
      // MOXIE oxygen maker with twin spinning turbines and O2 cyan core
      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0xd9cbb2 : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 10);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 10);

      // Intake grille bar across top
      const grilleY = innerY + 4;
      const grilleH = innerH < 72 ? 7 : 10;
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      g.fillRoundedRect(innerX + 10, grilleY, innerW - 28, grilleH, 3);
      g.strokeRoundedRect(innerX + 10, grilleY, innerW - 28, grilleH, 3);

      // Power/status LED on top right
      drawStatusLed(
        g,
        innerX + innerW - 11,
        grilleY + grilleH / 2,
        isInactive,
        isDamaged || !hasPower,
        isOperational && hasPower,
        animPhase,
        0x7be0d6,
        3
      );

      const cx1 = innerX + innerW * 0.34;
      const cy1 = grilleY + grilleH + (innerH - (grilleY - innerY + grilleH)) * 0.5;
      const cx2 = innerX + innerW * 0.74;
      const r1 = Math.max(10, Math.min(22, (innerH - grilleH - 10) * 0.44));
      const r2 = Math.max(8, Math.round(r1 * 0.72));

      if (isInactive) {
        g.fillStyle(PALETTE.wreckDark, 1);
        g.fillCircle(cx1, cy1, r1);
        g.strokeCircle(cx1, cy1, r1);
        g.lineBetween(cx1 - r1 * 0.55, cy1 - r1 * 0.55, cx1 + r1 * 0.55, cy1 + r1 * 0.55);
        g.lineBetween(cx1 + r1 * 0.55, cy1 - r1 * 0.55, cx1 - r1 * 0.55, cy1 + r1 * 0.55);

        g.fillStyle(0x4b5052, 1);
        g.fillCircle(cx2, cy1, r2);
        g.strokeCircle(cx2, cy1, r2);
        g.fillStyle(0x2f3335, 1);
        g.fillCircle(cx1, cy1, Math.max(3.5, r1 * 0.24));
      } else {
        g.fillStyle(isDamaged ? 0x5d7a8c : PALETTE.techBlueLight, 1);
        g.fillCircle(cx1, cy1, r1);
        g.strokeCircle(cx1, cy1, r1);
        g.fillCircle(cx2, cy1, r2);
        g.strokeCircle(cx2, cy1, r2);

        // Twin spinning turbine fans (smooth & fast when operational+powered; slow/stuttering when damaged)
        const angle1 =
          isOperational && hasPower
            ? animPhase * 4.2
            : isDamaged
            ? animPhase * 1.1 + Math.sin(animPhase * 4) * 0.2
            : 0.4;
        const angle2 =
          isOperational && hasPower
            ? -animPhase * 5.6
            : isDamaged
            ? -animPhase * 1.4
            : 0.8;
        g.lineStyle(2.6, PALETTE.charcoal, 1);
        for (let b = 0; b < 4; b++) {
          const a1 = angle1 + (b * Math.PI) / 2;
          g.lineBetween(cx1, cy1, cx1 + Math.cos(a1) * (r1 * 0.72), cy1 + Math.sin(a1) * (r1 * 0.72));
        }
        g.lineStyle(2.2, PALETTE.charcoal, 1);
        for (let b = 0; b < 3; b++) {
          const a2 = angle2 + (b * Math.PI * 2) / 3;
          g.lineBetween(cx2, cy1, cx2 + Math.cos(a2) * (r2 * 0.68), cy1 + Math.sin(a2) * (r2 * 0.68));
        }

        // Animated O2 intake/exhaust pulse ring when actively producing
        if (isOperational && hasPower) {
          const ringP = (animPhase * 1.4) % 1;
          g.lineStyle(1.8, 0xb0fff4, (1 - ringP) * 0.75);
          g.strokeCircle(cx1, cy1, r1 * (0.45 + ringP * 0.45));
        }

        // Glowing mint O2 hub rings
        g.fillStyle(PALETTE.creamLight, 1);
        g.fillCircle(cx1, cy1, Math.max(4.5, r1 * 0.28));
        g.strokeCircle(cx1, cy1, Math.max(4.5, r1 * 0.28));
        g.fillStyle(isOperational && hasPower ? 0x7be0d6 : 0xd99b52, 1);
        g.fillCircle(cx1, cy1, Math.max(2.4, r1 * 0.14));
        g.fillCircle(cx2, cy1, Math.max(3.4, r2 * 0.28));
        g.strokeCircle(cx2, cy1, Math.max(3.4, r2 * 0.28));
      }
      break;
    }

    case 'oxygen_storage': {
      // Crossover pipe connecting twin O2 tanks
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillRect(innerX + innerW / 2 - 5, innerY + innerH * 0.25, 10, innerH * 0.5);
      g.strokeRect(innerX + innerW / 2 - 5, innerY + innerH * 0.25, 10, innerH * 0.5);

      const tankR = innerW * 0.39;
      const topCy = innerY + innerH * 0.28;
      const botCy = innerY + innerH * 0.72;

      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0xd9d2c5 : PALETTE.creamLight, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillCircle(innerX + innerW / 2, topCy, tankR);
      g.strokeCircle(innerX + innerW / 2, topCy, tankR);
      if (!isInactive) {
        g.fillCircle(innerX + innerW / 2, botCy, tankR);
        g.strokeCircle(innerX + innerW / 2, botCy, tankR);
      } else {
        g.fillStyle(PALETTE.wreckDark, 1);
        g.fillCircle(innerX + innerW / 2, botCy, innerW * 0.36);
        g.strokeCircle(innerX + innerW / 2, botCy, innerW * 0.36);
      }

      // Tank fill indicator bands reflecting actual oxygen stored ratio
      const bandColor = isInactive
        ? 0x4b4643
        : isNearCap
        ? 0xf4c552
        : isDamaged
        ? PALETTE.terracotta
        : PALETTE.techBlue;
      g.fillStyle(0x3a4042, 1);
      g.fillRect(innerX + 10, innerY + innerH * 0.24, innerW - 20, 7);
      const fillBandW = isInactive ? 0 : Math.max(4, (innerW - 20) * storageRatio);
      if (fillBandW > 0) {
        g.fillStyle(bandColor, 1);
        g.fillRect(innerX + 10, innerY + innerH * 0.24, fillBandW, 7);
      }
      if (!isInactive) {
        g.fillStyle(0x3a4042, 1);
        g.fillRect(innerX + 10, innerY + innerH * 0.69, innerW - 20, 7);
        if (fillBandW > 0) {
          g.fillStyle(bandColor, 1);
          g.fillRect(innerX + 10, innerY + innerH * 0.69, fillBandW, 7);
        }
      }

      // Central pressure dial with live needle reflecting storageRatio!
      const dialX = innerX + innerW / 2;
      const dialY = innerY + innerH * 0.5;
      g.fillStyle(isInactive ? 0x45494b : PALETTE.creamLight, 1);
      g.lineStyle(2, isNearCap ? 0xf4c552 : PALETTE.charcoal, 1);
      g.fillCircle(dialX, dialY, 8.5);
      g.strokeCircle(dialX, dialY, 8.5);
      if (!isInactive) {
        // Needle sweeps from -135 deg (empty) to +135 deg (full)
        const needleAngle = -Math.PI * 1.25 + storageRatio * Math.PI * 1.5;
        g.lineStyle(2, isNearCap ? 0xb94f32 : PALETTE.lifeGreen, 1);
        g.lineBetween(
          dialX,
          dialY,
          dialX + Math.cos(needleAngle) * 5.5,
          dialY + Math.sin(needleAngle) * 5.5
        );
      }
      drawStatusLed(
        g,
        dialX,
        innerY + 8,
        isInactive,
        isDamaged,
        isOperational,
        animPhase,
        isNearCap ? 0xf4c552 : 0x7be0d6,
        2.6
      );
      break;
    }

    case 'water_recycling': {
      // Filtration deck + filter drum + animated cyan basin + continuous pipe loop
      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0xd9cbb2 : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 8);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 8);

      // Filtration basin
      g.fillStyle(isInactive ? 0x35393b : isDamaged ? 0x4b6a7a : PALETTE.techBlue, 1);
      g.fillRoundedRect(innerX + 10, innerY + 12, innerW - 20, innerH * 0.56, 8);
      g.strokeRoundedRect(innerX + 10, innerY + 12, innerW - 20, innerH * 0.56, 8);

      if (isOperational && hasPower) {
        // Multi-wave animated ripples & purification bubbles
        const wave1 = Math.sin(animPhase * 2.8) * 3.5;
        const wave2 = Math.cos(animPhase * 3.2) * 3;
        g.lineStyle(2.2, 0xdcf4ff, 0.88);
        g.lineBetween(innerX + 20, innerY + 28 + wave1, innerX + innerW - 20, innerY + 28 - wave1);
        g.lineStyle(1.8, PALETTE.creamLight, 0.7);
        g.lineBetween(innerX + 26, innerY + 42 + wave2, innerX + innerW - 26, innerY + 42 - wave2);

        const bubbleY = innerY + 46 - ((animPhase * 18) % 24);
        g.fillStyle(0xffffff, 0.85);
        g.fillCircle(innerX + innerW * 0.35, bubbleY, 3);
        g.fillCircle(innerX + innerW * 0.68, innerY + 46 - (((animPhase * 14) + 10) % 24), 2.5);
        g.fillCircle(innerX + innerW * 0.52, innerY + 48 - (((animPhase * 20) + 5) % 24), 2);
      } else if (isDamaged) {
        // Stagnant low-rippled water + leak puddle outside
        g.lineStyle(1.5, 0x8fb5c9, 0.45);
        g.lineBetween(innerX + 24, innerY + 34, innerX + innerW - 24, innerY + 34);
        g.fillStyle(PALETTE.techBlueLight, 0.65);
        g.fillEllipse(innerX + innerW * 0.25, innerY + innerH - 6, 22, 8);
      }

      // Filter drum on top-left corner with rotating rotor when operational
      const drumX = innerX + 22;
      const drumY = innerY + 18;
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillCircle(drumX, drumY, 9);
      g.strokeCircle(drumX, drumY, 9);
      if (isOperational && hasPower) {
        const rotorA = animPhase * 3.6;
        g.lineStyle(2, PALETTE.charcoal, 0.85);
        g.lineBetween(
          drumX - Math.cos(rotorA) * 5.5,
          drumY - Math.sin(rotorA) * 5.5,
          drumX + Math.cos(rotorA) * 5.5,
          drumY + Math.sin(rotorA) * 5.5
        );
      }

      // Status LED on top-right
      drawStatusLed(
        g,
        innerX + innerW - 14,
        innerY + 10,
        isInactive,
        isDamaged || !hasPower,
        isOperational && hasPower,
        animPhase,
        0x8be2ff,
        3
      );

      // Pipe conduits across bottom with animated water flow pulse when operational
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      if (isInactive) {
        g.fillRect(innerX + 14, innerY + innerH - 20, 26, 10);
        g.strokeRect(innerX + 14, innerY + innerH - 20, 26, 10);
        g.fillRect(innerX + innerW - 40, innerY + innerH - 20, 26, 10);
        g.strokeRect(innerX + innerW - 40, innerY + innerH - 20, 26, 10);
      } else {
        g.fillRect(innerX + 14, innerY + innerH - 20, innerW - 28, 10);
        g.strokeRect(innerX + 14, innerY + innerH - 20, innerW - 28, 10);
        if (isOperational && hasPower) {
          const flowT = (animPhase * 1.4) % 1;
          const pulseX = innerX + 18 + flowT * (innerW - 44);
          g.fillStyle(0x7be0ff, 0.95);
          g.fillRoundedRect(pulseX, innerY + innerH - 18, 10, 6, 3);
        }
      }
      break;
    }

    case 'water_storage': {
      // Ribbed insulated water reservoir + vertical sight-glass reflecting actual water stored!
      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0x5c7f94 : PALETTE.techBlueLight, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX + 4, innerY + 4, innerW - 8, innerH - 8, 12);
      g.strokeRoundedRect(innerX + 4, innerY + 4, innerW - 8, innerH - 8, 12);

      // Insulated tank bands
      g.fillStyle(isInactive ? 0x766e68 : PALETTE.cream, 1);
      g.fillRect(innerX + 4, innerY + innerH * 0.28, innerW - 8, 7);
      g.fillRect(innerX + 4, innerY + innerH * 0.66, innerW - 8, 7);

      // Clear vertical sight-glass tube on right side reflecting actual storageRatio
      const glassX = innerX + innerW - 16;
      const glassY = innerY + 14;
      const glassH = innerH - 28;
      g.fillStyle(PALETTE.charcoal, 1);
      g.fillRoundedRect(glassX, glassY, 8, glassH, 3);

      const maxFillH = glassH - 4;
      const fillH = isInactive ? 4 : Math.max(4, maxFillH * storageRatio);
      g.fillStyle(isInactive ? 0x3b3e40 : isNearCap ? 0xf4c552 : 0x8be2ff, 1);
      g.fillRoundedRect(glassX + 2, glassY + glassH - 2 - fillH, 4, fillH, 2);

      // Subtle animated water shimmer inside tank & sight-glass
      if (isOperational) {
        const waveY = innerY + innerH * 0.48 + Math.sin(animPhase * 2.6) * 2;
        g.lineStyle(1.8, 0xdcf4ff, 0.72);
        g.lineBetween(innerX + 12, waveY, innerX + innerW - 22, waveY);
      }

      // Near-cap limit warning ring at top of sight-glass
      if (isNearCap) {
        const pulse = 0.6 + 0.4 * Math.sin(animPhase * 4.5);
        g.fillStyle(0xf4c552, pulse);
        g.fillCircle(glassX + 4, glassY - 2, 4);
      }

      // Base heater fin (lit warm terracotta when operational, dark when inactive)
      g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? 0x8c563c : PALETTE.terracotta, 1);
      g.fillRoundedRect(innerX + 10, innerY + innerH - 12, innerW - 28, 6, 2);
      drawStatusLed(
        g,
        innerX + 14,
        innerY + 12,
        isInactive,
        isDamaged,
        isOperational,
        animPhase,
        isNearCap ? 0xf4c552 : 0x8be2ff,
        2.6
      );
      break;
    }

    case 'greenhouse': {
      // Curved glass biodome shell + LED grow light bars + 3 lush planter beds
      g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? 0xb8ccb9 : 0xd4ebdc, isInactive ? 1 : 0.94);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 14);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 14);

      // Top LED grow-light bar (off when inactive, dim when damaged, glowing when operational)
      if (!isInactive) {
        const ledPulse =
          isOperational && hasPower
            ? 0.68 + 0.32 * Math.sin(animPhase * 2.5)
            : 0.28;
        if (nightFactor > 0.1) {
          g.fillStyle(0xffb7df, nightFactor * (isOperational ? 0.28 : 0.12));
          g.fillRoundedRect(innerX + 4, innerY + 4, innerW - 8, innerH - 8, 12);
        }
        g.fillStyle(isDamaged ? 0xd999ba : 0xffc9e3, Math.min(1, ledPulse + nightFactor * 0.25));
        g.fillRoundedRect(innerX + 12, innerY + 5, innerW - 24, 5 + nightFactor * 2, 2);
      } else {
        g.fillStyle(0x3a3e40, 1);
        g.fillRoundedRect(innerX + 12, innerY + 5, innerW - 24, 5, 2);
      }

      // 3 planter beds
      const bedW = (innerW - 32) / 3;
      for (let i = 0; i < 3; i++) {
        const bx = innerX + 10 + i * (bedW + 6);
        const by = innerY + 14;
        const bh = innerH - 24;
        g.fillStyle(isInactive ? 0x3b3029 : 0x5c412e, 1);
        g.lineStyle(2, PALETTE.charcoal, 1);
        g.fillRoundedRect(bx, by, bedW, bh, 5);
        g.strokeRoundedRect(bx, by, bedW, bh, 5);

        if (!isInactive && crop) {
          const ratio = Math.min(1, crop.growthProgress / crop.growthDaysRequired);
          const leafRadius = 5 + ratio * 9.5;
          const leafColor = crop.isMature ? 0x9bbf5a : PALETTE.lifeGreenBright;
          const sway = isOperational ? Math.sin(animPhase * 2.2 + i) * 1.2 : 0;
          for (const rowY of [0.27, 0.54, 0.8]) {
            g.fillStyle(leafColor, 1);
            g.fillCircle(bx + bedW / 2 + sway, by + bh * rowY, leafRadius);
            g.fillStyle(0x52725b, 0.5);
            g.fillCircle(bx + bedW / 2 - 3 + sway, by + bh * rowY + 2, leafRadius * 0.45);
            if (crop.isMature) {
              g.fillStyle(crop.cropId === 'mars_potato' ? 0xf4c552 : 0xd77b4a, 1);
              g.fillCircle(bx + bedW / 2 + 4 + sway, by + bh * rowY - 3, 3.2);
            }
          }
          // Subtle hydroponic water mist droplets while actively growing
          if (isOperational && !crop.isMature) {
            const dropP = (animPhase * 0.9 + i * 0.33) % 1;
            g.fillStyle(0x8be2ff, Math.sin(dropP * Math.PI) * 0.75);
            g.fillCircle(bx + bedW * 0.35, by + 10 + dropP * (bh - 20), 2.2);
          }
        } else if (!isInactive) {
          g.fillStyle(PALETTE.lifeGreen, 0.55);
          g.fillCircle(bx + bedW / 2, by + bh * 0.35, 5);
          g.fillCircle(bx + bedW / 2, by + bh * 0.65, 5);
        }
      }

      if (isInactive) {
        // Broken jagged glass roof corner triangles
        g.fillStyle(0x8aa193, 0.5);
        g.fillTriangle(innerX, innerY, innerX + 46, innerY, innerX, innerY + 42);
        g.fillTriangle(
          innerX + innerW,
          innerY + innerH,
          innerX + innerW - 50,
          innerY + innerH,
          innerX + innerW,
          innerY + innerH - 42
        );
      }

      // Arch glass mullions
      g.lineStyle(2.5, PALETTE.charcoal, 0.7);
      g.lineBetween(innerX + innerW / 3, innerY, innerX + innerW / 3, innerY + innerH);
      g.lineBetween(innerX + (innerW * 2) / 3, innerY, innerX + (innerW * 2) / 3, innerY + innerH);
      drawStatusLed(
        g,
        innerX + innerW - 11,
        innerY + 11,
        isInactive,
        isDamaged || !hasPower,
        isOperational && hasPower,
        animPhase,
        crop?.isMature ? 0xf4c552 : PALETTE.lifeGreenBright,
        3
      );
      break;
    }

    case 'food_storage': {
      // Chilled vault door + frost strip + live Ration Capacity Meter
      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0xd9cbb2 : PALETTE.cream, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 6);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 6);

      // Frost cooling indicator strip
      g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? 0x628ea3 : 0x8be2ff, 1);
      g.fillRect(innerX + 6, innerY + 5, innerW - 12, 5);

      if (innerH < 64) {
        const doorH = innerH - 19;
        const doorW = innerW - 22;
        g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? 0x627366 : PALETTE.lifeGreen, 1);
        g.fillRoundedRect(innerX + 6, innerY + 13, doorW, doorH, 4);
        g.strokeRoundedRect(innerX + 6, innerY + 13, doorW, doorH, 4);
        g.fillStyle(isInactive ? 0x5c534e : PALETTE.creamLight, 1);
        g.lineStyle(2, PALETTE.charcoal, 1);
        g.fillCircle(innerX + 6 + doorW / 2, innerY + 13 + doorH / 2, 6.5);
        g.strokeCircle(innerX + 6 + doorW / 2, innerY + 13 + doorH / 2, 6.5);
        g.fillStyle(isInactive ? 0x3b3836 : PALETTE.sand, 1);
        g.fillCircle(innerX + 6 + doorW / 2, innerY + 13 + doorH / 2, 2.3);

        // Right-side vertical food capacity gauge
        const meterX = innerX + innerW - 13;
        const meterY = innerY + 13;
        g.fillStyle(PALETTE.charcoal, 1);
        g.fillRoundedRect(meterX, meterY, 7, doorH, 2.5);
        if (!isInactive) {
          const fillH = Math.max(3, (doorH - 4) * storageRatio);
          g.fillStyle(isNearCap ? 0xf4c552 : PALETTE.lifeGreenBright, 1);
          g.fillRoundedRect(meterX + 1.5, meterY + doorH - 2 - fillH, 4, fillH, 1.5);
        }
      } else {
        g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.lifeGreen, 1);
        g.fillRoundedRect(innerX + 6, innerY + 14, innerW - 18, 24, 3);
        g.strokeRoundedRect(innerX + 6, innerY + 14, innerW - 18, 24, 3);
        g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
        g.fillRoundedRect(innerX + 6, innerY + 44, innerW - 18, 24, 3);
        g.strokeRoundedRect(innerX + 6, innerY + 44, innerW - 18, 24, 3);

        g.fillStyle(isInactive ? 0x5c534e : PALETTE.creamLight, 1);
        g.fillCircle(innerX + (innerW - 12) / 2, innerY + 26, 4);
        g.fillCircle(innerX + (innerW - 12) / 2, innerY + 56, 4);
      }

      if (isNearCap) {
        const capPulse = 0.6 + 0.4 * Math.sin(animPhase * 4.2);
        g.lineStyle(2.2, 0xf4c552, capPulse);
        g.strokeRoundedRect(innerX + 2, innerY + 2, innerW - 4, innerH - 4, 5);
      }
      break;
    }

    case 'radiation_shelter': {
      // Reinforced regolith bunker frame with transparent armored glass bay
      g.lineStyle(3, PALETTE.charcoal, 1);
      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0xb56d49 : PALETTE.terracotta, 0.92);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 10);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 10);

      // Reinforced regolith corner armor pads
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.sand, 1);
      g.fillRect(innerX + 3, innerY + 3, 14, 10);
      g.fillRect(innerX + innerW - 17, innerY + 3, 14, 10);
      g.fillRect(innerX + 3, innerY + innerH - 13, 14, 10);
      g.fillRect(innerX + innerW - 17, innerY + innerH - 13, 14, 10);

      const bayX = innerX + 9;
      const bayY = innerY + 10;
      const bayW = innerW - 18;
      const bayH = innerH - 20;
      g.fillStyle(isInactive ? 0x2c3032 : 0xdcf4ff, isInactive ? 0.62 : 0.34);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(bayX, bayY, bayW, bayH, 8);
      if (!isInactive && (nightFactor > 0.12 || extra?.inShelter)) {
        const bayGlow = Math.max(nightFactor * 0.2, extra?.inShelter ? 0.28 : 0);
        g.fillStyle(0xffdf99, isOperational ? bayGlow : bayGlow * 0.45);
        g.fillRoundedRect(bayX + 3, bayY + 3, bayW - 6, bayH - 6, 6);
      }
      g.strokeRoundedRect(bayX, bayY, bayW, bayH, 8);

      if (!isInactive) {
        g.lineStyle(1.2, 0xfaf0dc, 0.45);
        g.lineBetween(bayX + bayW / 2, bayY + 6, bayX + bayW / 2, bayY + bayH - 6);
        g.lineBetween(bayX + 6, bayY + bayH / 2, bayX + bayW - 6, bayY + bayH / 2);
      }

      // Shield emblem on top rim + active safety beacon
      g.fillStyle(isInactive ? PALETTE.wreckDark : isDamaged ? PALETTE.terracotta : 0xf4c552, 1);
      g.lineStyle(2, PALETTE.charcoal, 1);
      g.fillTriangle(0, innerY - 5, 11, innerY + 9, -11, innerY + 9);
      g.strokeTriangle(0, innerY - 5, 11, innerY + 9, -11, innerY + 9);

      if (!isInactive && extra?.inShelter) {
        const glow = 0.6 + 0.4 * Math.sin(animPhase * 4.5);
        g.fillStyle(PALETTE.lifeGreenBright, glow);
        g.fillCircle(0, innerY + 4, 5);
        g.lineStyle(2, PALETTE.charcoal, 1);
        g.strokeCircle(0, innerY + 4, 5);
      } else {
        drawStatusLed(g, innerX + innerW - 12, innerY + 14, isInactive, isDamaged, isOperational, animPhase, PALETTE.lifeGreenBright, 2.8);
      }
      break;
    }

    case 'maintenance_facility': {
      // Open-bay workshop + striped safety apron + animated overhead gantry hoist
      g.fillStyle(isInactive ? PALETTE.wreckMetal : isDamaged ? 0xcfa470 : PALETTE.sand, 1);
      g.lineStyle(2.5, PALETTE.charcoal, 1);
      g.fillRoundedRect(innerX, innerY, innerW, innerH, 6);
      g.strokeRoundedRect(innerX, innerY, innerW, innerH, 6);

      const bayPadY = innerH < 64 ? 7 : 12;
      const bayH = innerH < 64 ? innerH - 18 : innerH - 28;
      g.fillStyle(isInactive ? PALETTE.wreckDark : PALETTE.creamLight, 1);
      g.fillRect(innerX + 12, innerY + bayPadY, innerW - 24, bayH);
      g.strokeRect(innerX + 12, innerY + bayPadY, innerW - 24, bayH);

      // Overhead gantry beam
      const beamH = innerH < 64 ? 7 : 10;
      g.fillStyle(isInactive ? 0x565d61 : PALETTE.terracotta, 1);
      const barY = isDamaged ? innerY + innerH * 0.25 : innerY + innerH * 0.34;
      g.fillRect(innerX + 8, barY, innerW - 16, beamH);
      g.strokeRect(innerX + 8, barY, innerW - 16, beamH);

      // Animated sliding gantry hoist trolley when operational
      if (isOperational && hasPower) {
        const hoistX =
          innerX + innerW * 0.5 + Math.sin(animPhase * 1.6) * (innerW * 0.26);
        g.fillStyle(PALETTE.techBlue, 1);
        g.lineStyle(2, PALETTE.charcoal, 1);
        g.fillRoundedRect(hoistX - 8, barY - 2, 16, beamH + 4, 3);
        g.strokeRoundedRect(hoistX - 8, barY - 2, 16, beamH + 4, 3);
        g.fillStyle(0xf4c552, 1);
        g.fillCircle(hoistX, barY + beamH / 2, 2.5);
      }

      // Safety apron stripes along front floor
      g.fillStyle(isInactive ? PALETTE.wreckDark : 0xf4c552, 1);
      g.fillRect(innerX + 14, innerY + innerH - 10, innerW - 28, 5);
      if (isOperational) {
        const lamp = 0.6 + 0.4 * Math.sin(animPhase * 3);
        const lampY = innerY + Math.min(20, innerH * 0.28);
        if (nightFactor > 0.1) {
          g.fillStyle(0xffe19c, nightFactor * 0.32);
          g.fillCircle(innerX + innerW - 20, lampY, 13);
        }
        g.fillStyle(0xf4c552, Math.min(1, lamp + nightFactor * 0.2));
        g.fillCircle(innerX + innerW - 20, lampY, 4 + nightFactor * 1.4);
      } else {
        drawStatusLed(g, innerX + innerW - 20, innerY + 12, isInactive, isDamaged, false, animPhase);
      }
      break;
    }
  }

  // Visible broken/damaged overlays reflecting the specific event & severity (retained until repaired)
  const showDamageOverlay = isInactive || isDamaged || Boolean(state.hasVisibleDamage);
  if (isInactive) {
    drawDebrisChunks(g, innerX, innerY, innerW, innerH, state.damageCause, state.damageSeverity);
    drawEventSpecificDamage(
      g,
      innerX,
      innerY,
      innerW,
      innerH,
      state.damageCause,
      true,
      state.damageSeverity
    );
  } else if (showDamageOverlay) {
    drawEventSpecificDamage(
      g,
      innerX,
      innerY,
      innerW,
      innerH,
      state.damageCause,
      state.damageSeverity === 'major' || state.damageSeverity === 'super_major',
      state.damageSeverity
    );
  }

  // Active Repairing Diagnostic Corner Brackets when crew is actively fixing/restoring/cleaning
  if (isRepairing) {
    const pulse = 0.55 + 0.45 * Math.sin(animPhase * 6.5);
    const bracketColor = extra?.repairTaskKind === 'clean' ? 0xf4c552 : PALETTE.techBlueLight;
    g.lineStyle(3, bracketColor, 0.45 + pulse * 0.5);
    g.strokeRoundedRect(x - 3, y - 3, w + 6, h + 6, 10);
  }

  // On-building condition bar whenever damaged, inactive, or visibly cracked (hidden when Sol-1 locked)
  if (showDamageOverlay && !extra?.isLocked) {
    const barW = Math.min(82, width - 20);
    const barX = -barW / 2;
    const barY = -height / 2 - 12;
    g.fillStyle(PALETTE.charcoal, 1);
    g.fillRoundedRect(barX - 2, barY - 2, barW + 4, 10, 4);
    g.fillStyle(0x4b4846, 1);
    g.fillRoundedRect(barX, barY, barW, 6, 2);
    g.fillStyle(isInactive ? 0x9c6244 : PALETTE.terracotta, 1);
    g.fillRoundedRect(barX, barY, Math.max(4, (barW * state.condition) / 100), 6, 2);
  }

  // Subtle Sol 1 padlock badge in upper-right corner for locked non-essential facilities
  if (extra?.isLocked) {
    const lx = x + w - 12;
    const ly = y + 12;
    g.fillStyle(PALETTE.cream, 0.96);
    g.lineStyle(2, PALETTE.charcoal, 1);
    g.fillCircle(lx, ly, 10);
    g.strokeCircle(lx, ly, 10);
    // Shackle arc
    g.lineStyle(2, PALETTE.charcoal, 1);
    g.strokeRoundedRect(lx - 3.5, ly - 6.5, 7, 6, 3);
    // Padlock body
    g.fillStyle(0x5e5955, 1);
    g.fillRoundedRect(lx - 5, ly - 1.5, 10, 7.5, 2);
    g.strokeRoundedRect(lx - 5, ly - 1.5, 10, 7.5, 2);
  }
}

export interface AstronautBuildOptions {
  name: string;
  suitAccent: number;
  skinTone: number;
  hairColor: number;
  isPlayer?: boolean;
}

function buildHumanAstronautContainer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: AstronautBuildOptions
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);

  // Ground shadow stays planted while bodyGroup hops/bobs
  const shadow = scene.add.graphics();
  shadow.fillStyle(PALETTE.charcoal, 0.32);
  shadow.fillEllipse(0, 18, opts.isPlayer ? 28 : 24, 11);

  const bodyGroup = scene.add.container(0, 0);
  bodyGroup.setName('bodyGroup');

  // Oxygen backpack
  const backpack = scene.add.graphics();
  backpack.fillStyle(PALETTE.sand, 1);
  backpack.lineStyle(2.2, PALETTE.charcoal, 1);
  backpack.fillRoundedRect(-12, -13, 24, 17, 5);
  backpack.strokeRoundedRect(-12, -13, 24, 17, 5);

  // Articulated legs / boots
  const leftLeg = scene.add.graphics();
  leftLeg.setName('leftLeg');
  leftLeg.fillStyle(PALETTE.creamLight, 1);
  leftLeg.lineStyle(2.2, PALETTE.charcoal, 1);
  leftLeg.fillRoundedRect(-8, 6, 7, 11, 3);
  leftLeg.strokeRoundedRect(-8, 6, 7, 11, 3);
  leftLeg.fillStyle(opts.suitAccent, 1);
  leftLeg.fillRect(-8, 12, 7, 4);

  const rightLeg = scene.add.graphics();
  rightLeg.setName('rightLeg');
  rightLeg.fillStyle(PALETTE.creamLight, 1);
  rightLeg.lineStyle(2.2, PALETTE.charcoal, 1);
  rightLeg.fillRoundedRect(1, 6, 7, 11, 3);
  rightLeg.strokeRoundedRect(1, 6, 7, 11, 3);
  rightLeg.fillStyle(opts.suitAccent, 1);
  rightLeg.fillRect(1, 12, 7, 4);

  // Left arm
  const leftArm = scene.add.graphics();
  leftArm.setName('leftArm');
  leftArm.setPosition(-9, -3);
  leftArm.fillStyle(PALETTE.creamLight, 1);
  leftArm.lineStyle(2.2, PALETTE.charcoal, 1);
  leftArm.fillRoundedRect(-5, -2, 6, 12, 3);
  leftArm.strokeRoundedRect(-5, -2, 6, 12, 3);
  leftArm.fillStyle(opts.suitAccent, 1);
  leftArm.fillCircle(-2, 10, 3);
  leftArm.strokeCircle(-2, 10, 3);

  // Right arm + attachable contextual tool props
  const rightArm = scene.add.container(9, -3);
  rightArm.setName('rightArm');
  const rightArmG = scene.add.graphics();
  rightArmG.fillStyle(PALETTE.creamLight, 1);
  rightArmG.lineStyle(2.2, PALETTE.charcoal, 1);
  rightArmG.fillRoundedRect(-1, -2, 6, 12, 3);
  rightArmG.strokeRoundedRect(-1, -2, 6, 12, 3);
  rightArmG.fillStyle(opts.suitAccent, 1);
  rightArmG.fillCircle(2, 10, 3);
  rightArmG.strokeCircle(2, 10, 3);
  rightArm.add(rightArmG);

  // Contextual tool props held in right hand (wrench, brush, seed pouch)
  const wrenchProp = scene.add.graphics();
  wrenchProp.setName('wrenchProp');
  wrenchProp.lineStyle(3, PALETTE.charcoal, 1);
  wrenchProp.lineBetween(2, 9, 13, -3);
  wrenchProp.fillStyle(0xd8e0e6, 1);
  wrenchProp.lineStyle(2, PALETTE.charcoal, 1);
  wrenchProp.fillCircle(14, -4, 4.5);
  wrenchProp.strokeCircle(14, -4, 4.5);
  wrenchProp.fillStyle(PALETTE.marsRed, 1);
  wrenchProp.fillCircle(15, -5, 1.8);
  wrenchProp.setVisible(false);

  const brushProp = scene.add.graphics();
  brushProp.setName('brushProp');
  brushProp.lineStyle(3, PALETTE.sand, 1);
  brushProp.lineBetween(2, 9, 14, -2);
  brushProp.fillStyle(PALETTE.techBlueLight, 1);
  brushProp.lineStyle(2, PALETTE.charcoal, 1);
  brushProp.fillRoundedRect(10, -7, 10, 6, 2);
  brushProp.strokeRoundedRect(10, -7, 10, 6, 2);
  brushProp.setVisible(false);

  const seedProp = scene.add.graphics();
  seedProp.setName('seedProp');
  seedProp.fillStyle(PALETTE.lifeGreenBright, 1);
  seedProp.lineStyle(2, PALETTE.charcoal, 1);
  seedProp.fillCircle(5, 8, 4.5);
  seedProp.strokeCircle(5, 8, 4.5);
  seedProp.fillStyle(0xf4c552, 1);
  seedProp.fillCircle(7, 5, 2);
  seedProp.setVisible(false);

  const tabletProp = scene.add.graphics();
  tabletProp.setName('tabletProp');
  tabletProp.fillStyle(PALETTE.charcoal, 1);
  tabletProp.lineStyle(1.8, PALETTE.creamLight, 0.9);
  tabletProp.fillRoundedRect(2, -1, 10, 8, 2);
  tabletProp.strokeRoundedRect(2, -1, 10, 8, 2);
  tabletProp.fillStyle(0x7be0d6, 0.95);
  tabletProp.fillRect(3.5, 0.5, 7, 5);
  tabletProp.setVisible(false);

  rightArm.add([wrenchProp, brushProp, seedProp, tabletProp]);

  // Torso spacesuit with mission color stripe
  const torso = scene.add.graphics();
  torso.fillStyle(PALETTE.creamLight, 1);
  torso.lineStyle(2.4, PALETTE.charcoal, 1);
  torso.fillRoundedRect(-9.5, -8, 19, 17, 6);
  torso.strokeRoundedRect(-9.5, -8, 19, 17, 6);
  // Colored chest stripe & belt
  torso.fillStyle(opts.suitAccent, 1);
  torso.fillRect(-8, -2, 16, 4.5);
  torso.fillStyle(PALETTE.charcoal, 0.85);
  torso.fillRect(-8.5, 4, 17, 2.5);
  torso.fillStyle(0xf4c552, 1);
  torso.fillCircle(0, 0, 2.2);

  // Clear-glass helmet with clearly visible human face inside
  const head = scene.add.graphics();
  // Outer glass dome
  head.fillStyle(0xdcf0fa, 0.96);
  head.lineStyle(2.5, PALETTE.charcoal, 1);
  head.fillCircle(0, -17, 13.5);
  head.strokeCircle(0, -17, 13.5);
  // Human head & skin
  head.fillStyle(opts.skinTone, 1);
  head.fillCircle(0, -16.5, 9.2);
  // Friendly hair tuft
  head.fillStyle(opts.hairColor, 1);
  head.fillEllipse(0, -23.5, 14, 6);
  // Expressive human eyes + smile
  head.fillStyle(PALETTE.charcoal, 1);
  head.fillCircle(-3.4, -17, 1.5);
  head.fillCircle(3.4, -17, 1.5);
  head.fillStyle(0xffffff, 1);
  head.fillCircle(-3.0, -17.5, 0.55);
  head.fillCircle(3.8, -17.5, 0.55);
  // Rosy cheeks & smile
  head.fillStyle(0xe88a78, 0.75);
  head.fillCircle(-5.5, -14.5, 1.5);
  head.fillCircle(5.5, -14.5, 1.5);
  head.lineStyle(1.7, PALETTE.charcoal, 1);
  head.beginPath();
  head.arc(0, -14.5, 3.2, 0.25, Math.PI - 0.25, false);
  head.strokePath();
  // Glass helmet rim & curved reflection glint
  head.lineStyle(2, 0xffffff, 0.75);
  head.beginPath();
  head.arc(-2, -19, 9, Math.PI * 1.05, Math.PI * 1.45, false);
  head.strokePath();
  // Neck collar ring
  head.fillStyle(opts.suitAccent, 1);
  head.lineStyle(2, PALETTE.charcoal, 1);
  head.fillRoundedRect(-7, -8.5, 14, 3.5, 1.5);
  head.strokeRoundedRect(-7, -8.5, 14, 3.5, 1.5);

  bodyGroup.add([backpack, leftLeg, rightLeg, leftArm, torso, rightArm, head]);

  const textResolution =
    typeof window !== 'undefined'
      ? Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 2)))
      : 2;

  const label = scene.add
    .text(0, 24, opts.name, {
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: opts.isPlayer ? '#FAF0DC' : '#292C2B',
      backgroundColor: opts.isPlayer ? '#292C2B' : '#F1D8A8',
      padding: { x: 4, y: 1.5 },
    })
    .setOrigin(0.5)
    .setResolution(textResolution);

  container.add([shadow, bodyGroup, label]);

  if (opts.isPlayer) {
    // Floating upside-down gold triangle indicator pointing down toward Brent
    const indicator = scene.add.graphics();
    indicator.setName('nasIndicator');
    indicator.fillStyle(0xf4c552, 1);
    indicator.lineStyle(2.5, PALETTE.charcoal, 1);
    indicator.fillTriangle(-8, -48, 8, -48, 0, -36);
    indicator.strokeTriangle(-8, -48, 8, -48, 0, -36);
    container.add(indicator);
    container.setScale(1.08);
    container.setDepth(42);
  } else {
    container.setScale(0.92);
    container.setDepth(39);
  }

  return container;
}

export function createNasContainer(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  return buildHumanAstronautContainer(scene, x, y, {
    name: 'You',
    suitAccent: PALETTE.marsRed,
    skinTone: 0xf4c7a1,
    hairColor: 0x4b3224,
    isPlayer: true,
  });
}

export function createCrewMemberContainer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: Omit<AstronautBuildOptions, 'isPlayer'>
): Phaser.GameObjects.Container {
  return buildHumanAstronautContainer(scene, x, y, {
    ...opts,
    isPlayer: false,
  });
}

export function createGilContainer(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);

  // Hover shadow
  const shadow = scene.add.graphics();
  shadow.fillStyle(PALETTE.charcoal, 0.25);
  shadow.fillEllipse(0, 17, 20, 8);

  const gilBody = scene.add.container(0, 0);
  gilBody.setName('gilBody');

  const g = scene.add.graphics();
  // Thruster glow
  g.fillStyle(PALETTE.techBlueLight, 0.55);
  g.fillEllipse(0, 12, 12, 5);

  // Side ear-pods
  g.fillStyle(PALETTE.sand, 1);
  g.lineStyle(2, PALETTE.charcoal, 1);
  g.fillRoundedRect(-15, -5, 4, 8, 2);
  g.strokeRoundedRect(-15, -5, 4, 8, 2);
  g.fillRoundedRect(11, -5, 4, 8, 2);
  g.strokeRoundedRect(11, -5, 4, 8, 2);

  // Chunky AI pod chassis
  g.fillStyle(PALETTE.techBlue, 1);
  g.lineStyle(2.5, PALETTE.charcoal, 1);
  g.fillRoundedRect(-12, -12, 24, 21, 8);
  g.strokeRoundedRect(-12, -12, 24, 21, 8);

  // Screen face
  g.fillStyle(PALETTE.charcoal, 1);
  g.fillRoundedRect(-8.5, -8, 17, 12, 4);

  // Expressive eyes & smile
  g.fillStyle(PALETTE.creamLight, 1);
  g.fillCircle(-3.6, -3, 2.3);
  g.fillCircle(3.6, -3, 2.3);
  g.fillStyle(PALETTE.techBlue, 1);
  g.fillCircle(-3.2, -3.3, 0.8);
  g.fillCircle(4.0, -3.3, 0.8);

  g.lineStyle(1.8, PALETTE.lifeGreenBright, 1);
  g.beginPath();
  g.arc(0, -0.5, 3.2, 0.2, Math.PI - 0.2, false);
  g.strokePath();

  // Antenna fin
  g.lineStyle(2.2, PALETTE.charcoal, 1);
  g.lineBetween(0, -12, 0, -18);
  g.fillStyle(0xf4c552, 1);
  g.fillCircle(0, -19.5, 3.2);
  g.strokeCircle(0, -19.5, 3.2);

  gilBody.add(g);
  container.add([shadow, gilBody]);
  container.setDepth(43);
  return container;
}
