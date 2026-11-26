import * as THREE from 'three';

export interface ProceduralTextureSet {
  flameLiveryMap: THREE.CanvasTexture;
  paintRoughnessMap: THREE.CanvasTexture;
  tireTreadMap: THREE.CanvasTexture;
  tireBumpMap: THREE.CanvasTexture;
  terrainGrainMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  shockwaveRingMap: THREE.CanvasTexture;
  dustPuffMap: THREE.CanvasTexture;
  sparkleFlareMap: THREE.CanvasTexture;
  sunbeamMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy = 8): ProceduralTextureSet {
  const aniso = Math.max(1, Math.min(16, maxAnisotropy));

  // 1. Upgraded Crimson Flame Racer Side Livery (metallic crimson + shadow-outlined flames + panel seams)
  const flameCanvas = document.createElement('canvas');
  flameCanvas.width = 512;
  flameCanvas.height = 256;
  const fctx = flameCanvas.getContext('2d')!;

  const bgGrad = fctx.createLinearGradient(0, 0, 0, 256);
  bgGrad.addColorStop(0, '#FF3336');
  bgGrad.addColorStop(0.45, '#D41520');
  bgGrad.addColorStop(0.82, '#8E0B15');
  bgGrad.addColorStop(1, '#58060D');
  fctx.fillStyle = bgGrad;
  fctx.fillRect(0, 0, 512, 256);

  // Subtle metallic highlight band across upper beltline
  const sheenGrad = fctx.createLinearGradient(0, 12, 0, 58);
  sheenGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
  fctx.fillStyle = sheenGrad;
  fctx.fillRect(0, 12, 512, 46);

  // Carbon rocker skirt + gold racing trim line
  fctx.fillStyle = '#151922';
  fctx.fillRect(0, 206, 512, 50);
  fctx.fillStyle = '#232936';
  for (let x = 0; x < 512; x += 12) {
    fctx.fillRect(x, 212, 6, 40);
  }
  fctx.fillStyle = '#FFCA28';
  fctx.fillRect(0, 198, 512, 9);
  fctx.fillStyle = '#0D1117';
  fctx.fillRect(0, 195, 512, 3);

  // Multi-layered racing flames with dark contrast outline
  const drawFlamePath = (offsetY: number, scale: number) => {
    fctx.beginPath();
    fctx.moveTo(512, 56 + offsetY);
    fctx.bezierCurveTo(430, 32 + offsetY, 355, 108 + offsetY, 245, 76 + offsetY);
    fctx.bezierCurveTo(300, 118 + offsetY, 224, 146 + offsetY, 122, 134 + offsetY);
    fctx.bezierCurveTo(212, 168 + offsetY, 162, 192 + offsetY, 72, 195 + offsetY);
    fctx.lineTo(512, 196 + offsetY * scale);
    fctx.closePath();
  };

  drawFlamePath(-3, 1);
  fctx.fillStyle = '#4A060B';
  fctx.fill();

  drawFlamePath(0, 1);
  fctx.fillStyle = '#FF5E00';
  fctx.fill();

  drawFlamePath(16, 0.92);
  fctx.fillStyle = '#FFB703';
  fctx.fill();

  drawFlamePath(34, 0.84);
  fctx.fillStyle = '#FFF5B8';
  fctx.fill();

  // Subtle door seam, chrome handle & rear fender air vent
  fctx.strokeStyle = 'rgba(20, 8, 12, 0.55)';
  fctx.lineWidth = 3;
  fctx.strokeRect(170, 24, 138, 168);

  // Chrome door handle
  fctx.fillStyle = '#DCE4EE';
  fctx.beginPath();
  fctx.roundRect(184, 52, 28, 10, 4);
  fctx.fill();

  // Side intake vent louvers
  fctx.fillStyle = '#11161F';
  for (let v = 0; v < 4; v++) {
    fctx.beginPath();
    fctx.roundRect(352 + v * 16, 42, 9, 28, 3);
    fctx.fill();
  }

  // Bold Racing Number Plate ("01") with checkered edge accent
  fctx.fillStyle = '#FFFFFF';
  fctx.beginPath();
  fctx.roundRect(190, 74, 106, 66, 10);
  fctx.fill();
  fctx.lineWidth = 4;
  fctx.strokeStyle = '#111827';
  fctx.stroke();

  // Mini checkered flag accent bar on left edge of plate
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      fctx.fillStyle = (row + col) % 2 === 0 ? '#111827' : '#FFFFFF';
      fctx.fillRect(194 + col * 8, 80 + row * 13, 8, 13);
    }
  }

  fctx.fillStyle = '#111827';
  fctx.font = 'italic 900 44px sans-serif';
  fctx.textAlign = 'center';
  fctx.textBaseline = 'middle';
  fctx.fillText('01', 252, 109);

  const flameLiveryMap = new THREE.CanvasTexture(flameCanvas);
  flameLiveryMap.colorSpace = THREE.SRGBColorSpace;
  flameLiveryMap.anisotropy = aniso;

  // 2. Metallic-Flake Clearcoat Roughness Map (linear data map!)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#383838';
  rCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const x = (i * 97) % 256;
    const y = (i * 53 + Math.floor(i / 8) * 29) % 256;
    const v = 36 + ((i * 19) % 38);
    rCtx.fillStyle = `rgb(${v},${v},${v})`;
    rCtx.fillRect(x, y, 2, 2);
  }
  const paintRoughnessMap = new THREE.CanvasTexture(roughCanvas);
  paintRoughnessMap.wrapS = THREE.RepeatWrapping;
  paintRoughnessMap.wrapT = THREE.RepeatWrapping;
  paintRoughnessMap.repeat.set(3, 3);

  // 3. Monster Truck Chevron Tire Tread Albedo + Deep Bump Map
  const treadCanvas = document.createElement('canvas');
  treadCanvas.width = 256;
  treadCanvas.height = 512;
  const tctx = treadCanvas.getContext('2d')!;
  tctx.fillStyle = '#181B21';
  tctx.fillRect(0, 0, 256, 512);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 512;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#202020';
  bctx.fillRect(0, 0, 256, 512);

  // Subtle dusty groove tint inside tread valleys
  tctx.fillStyle = '#2E261E';
  tctx.fillRect(118, 0, 20, 512);

  const lugRows = 16;
  const rowH = 512 / lugRows;
  for (let i = 0; i < lugRows; i++) {
    const y = i * rowH;
    tctx.fillStyle = '#2A2F38';
    bctx.fillStyle = '#F5F5F5';
    for (const ctx of [tctx, bctx]) {
      ctx.beginPath();
      ctx.moveTo(8, y + 3);
      ctx.lineTo(118, y + rowH * 0.56);
      ctx.lineTo(118, y + rowH * 0.94);
      ctx.lineTo(8, y + rowH * 0.44);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(248, y + rowH * 0.24);
      ctx.lineTo(138, y + rowH * 0.78);
      ctx.lineTo(138, y + rowH * 1.14);
      ctx.lineTo(248, y + rowH * 0.62);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tireTreadMap = new THREE.CanvasTexture(treadCanvas);
  tireTreadMap.colorSpace = THREE.SRGBColorSpace;
  tireTreadMap.wrapS = THREE.RepeatWrapping;
  tireTreadMap.wrapT = THREE.RepeatWrapping;
  tireTreadMap.anisotropy = aniso;

  const tireBumpMap = new THREE.CanvasTexture(bumpCanvas);
  tireBumpMap.wrapS = THREE.RepeatWrapping;
  tireBumpMap.wrapT = THREE.RepeatWrapping;
  tireBumpMap.anisotropy = aniso;

  // 4. Organic Alpine Terrain Grain (rich pebbles + tire rut striations)
  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = 256;
  grainCanvas.height = 256;
  const gctx = grainCanvas.getContext('2d')!;
  gctx.fillStyle = '#EDEDED';
  gctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137 + Math.floor(i / 4) * 19) % 256;
    const shade = 205 + ((i * 29) % 48);
    gctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    gctx.fillRect(x, y, 3, 3);
  }
  gctx.fillStyle = 'rgba(170, 170, 170, 0.24)';
  for (let y = 0; y < 256; y += 32) {
    gctx.fillRect(0, y, 256, 5);
  }
  const terrainGrainMap = new THREE.CanvasTexture(grainCanvas);
  terrainGrainMap.colorSpace = THREE.SRGBColorSpace;
  terrainGrainMap.wrapS = THREE.RepeatWrapping;
  terrainGrainMap.wrapT = THREE.RepeatWrapping;
  terrainGrainMap.repeat.set(6, 2);
  terrainGrainMap.anisotropy = aniso;

  // 5. Soft Radial Contact Shadow Map
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const sGrad = sctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  sGrad.addColorStop(0, 'rgba(6, 14, 10, 0.78)');
  sGrad.addColorStop(0.55, 'rgba(6, 14, 10, 0.36)');
  sGrad.addColorStop(1, 'rgba(6, 14, 10, 0)');
  sctx.fillStyle = sGrad;
  sctx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);

  // 6. High-Detail Dual-Band Shockwave Ring Map
  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = 256;
  ringCanvas.height = 256;
  const swctx = ringCanvas.getContext('2d')!;
  const swGrad = swctx.createRadialGradient(128, 128, 56, 128, 128, 124);
  swGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  swGrad.addColorStop(0.42, 'rgba(255, 248, 225, 0.92)');
  swGrad.addColorStop(0.68, 'rgba(255, 224, 165, 0.58)');
  swGrad.addColorStop(0.86, 'rgba(240, 200, 140, 0.22)');
  swGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  swctx.fillStyle = swGrad;
  swctx.fillRect(0, 0, 256, 256);

  // Crisp radial dust streaks around shockwave rim
  swctx.save();
  swctx.translate(128, 128);
  for (let i = 0; i < 24; i++) {
    swctx.rotate((Math.PI * 2) / 24);
    swctx.fillStyle = 'rgba(255, 250, 232, 0.36)';
    swctx.fillRect(72, -2, 38, 4);
  }
  swctx.restore();
  const shockwaveRingMap = new THREE.CanvasTexture(ringCanvas);
  shockwaveRingMap.colorSpace = THREE.SRGBColorSpace;

  // 7. Painterly Soft Volumetric Dust Puff Cloud Sprite
  const puffCanvas = document.createElement('canvas');
  puffCanvas.width = 128;
  puffCanvas.height = 128;
  const pctx = puffCanvas.getContext('2d')!;
  const lobes = [
    { x: 64, y: 64, r: 46, a: 0.72 },
    { x: 46, y: 58, r: 34, a: 0.58 },
    { x: 82, y: 62, r: 34, a: 0.56 },
    { x: 62, y: 46, r: 30, a: 0.52 },
    { x: 66, y: 80, r: 32, a: 0.48 },
  ];
  for (const lb of lobes) {
    const grad = pctx.createRadialGradient(lb.x, lb.y, 4, lb.x, lb.y, lb.r);
    grad.addColorStop(0, `rgba(255, 255, 255, ${lb.a})`);
    grad.addColorStop(0.55, `rgba(255, 255, 255, ${lb.a * 0.48})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    pctx.fillStyle = grad;
    pctx.beginPath();
    pctx.arc(lb.x, lb.y, lb.r, 0, Math.PI * 2);
    pctx.fill();
  }
  const dustPuffMap = new THREE.CanvasTexture(puffCanvas);
  dustPuffMap.colorSpace = THREE.SRGBColorSpace;

  // 8. 4-Point Starburst Sparkle Flare Sprite (for Coin Explosions & Nitro Glints)
  const flareCanvas = document.createElement('canvas');
  flareCanvas.width = 128;
  flareCanvas.height = 128;
  const flctx = flareCanvas.getContext('2d')!;
  const coreG = flctx.createRadialGradient(64, 64, 2, 64, 64, 54);
  coreG.addColorStop(0, 'rgba(255, 255, 255, 1)');
  coreG.addColorStop(0.25, 'rgba(255, 240, 175, 0.85)');
  coreG.addColorStop(1, 'rgba(255, 200, 50, 0)');
  flctx.fillStyle = coreG;
  flctx.fillRect(0, 0, 128, 128);

  flctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  flctx.beginPath();
  flctx.moveTo(64, 4);
  flctx.quadraticCurveTo(70, 58, 124, 64);
  flctx.quadraticCurveTo(70, 70, 64, 124);
  flctx.quadraticCurveTo(58, 70, 4, 64);
  flctx.quadraticCurveTo(58, 58, 64, 4);
  flctx.closePath();
  flctx.fill();
  const sparkleFlareMap = new THREE.CanvasTexture(flareCanvas);
  sparkleFlareMap.colorSpace = THREE.SRGBColorSpace;

  // 9. Soft Feathered Alpine Sunbeam Shaft Texture
  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 128;
  beamCanvas.height = 256;
  const bmctx = beamCanvas.getContext('2d')!;
  const bmVert = bmctx.createLinearGradient(0, 0, 0, 256);
  bmVert.addColorStop(0, 'rgba(255, 248, 220, 0)');
  bmVert.addColorStop(0.22, 'rgba(255, 246, 210, 0.24)');
  bmVert.addColorStop(0.75, 'rgba(255, 242, 198, 0.12)');
  bmVert.addColorStop(1, 'rgba(255, 242, 198, 0)');
  bmctx.fillStyle = bmVert;
  bmctx.fillRect(0, 0, 128, 256);

  // Horizontal soft vignette mask
  bmctx.globalCompositeOperation = 'destination-in';
  const bmHoriz = bmctx.createLinearGradient(0, 0, 128, 0);
  bmHoriz.addColorStop(0, 'rgba(0,0,0,0)');
  bmHoriz.addColorStop(0.32, 'rgba(0,0,0,1)');
  bmHoriz.addColorStop(0.68, 'rgba(0,0,0,1)');
  bmHoriz.addColorStop(1, 'rgba(0,0,0,0)');
  bmctx.fillStyle = bmHoriz;
  bmctx.fillRect(0, 0, 128, 256);
  const sunbeamMap = new THREE.CanvasTexture(beamCanvas);
  sunbeamMap.colorSpace = THREE.SRGBColorSpace;

  return {
    flameLiveryMap,
    paintRoughnessMap,
    tireTreadMap,
    tireBumpMap,
    terrainGrainMap,
    contactShadowMap,
    shockwaveRingMap,
    dustPuffMap,
    sparkleFlareMap,
    sunbeamMap,
    dispose: () => {
      flameLiveryMap.dispose();
      paintRoughnessMap.dispose();
      tireTreadMap.dispose();
      tireBumpMap.dispose();
      terrainGrainMap.dispose();
      contactShadowMap.dispose();
      shockwaveRingMap.dispose();
      dustPuffMap.dispose();
      sparkleFlareMap.dispose();
      sunbeamMap.dispose();
    },
  };
}
