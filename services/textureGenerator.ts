import { PBRParams, Resolution, NormalMode, TextureSet } from '../types';

// --- Helper Functions ---

// Creates a pure ImageData object (no canvas overhead)
const createBuffer = (w: number, h: number, sourceData?: Uint8ClampedArray): ImageData => {
  if (sourceData) {
    // Clone the data to avoid reference issues
    const copiedData = new Uint8ClampedArray(sourceData);
    return new ImageData(copiedData, w, h);
  }
  return new ImageData(w, h);
};

const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) => {
  const ratio = Math.max(w / img.width, h / img.height);
  const cx = (w - img.width * ratio) / 2;
  const cy = (h - img.height * ratio) / 2;
  
  // Clear and set background to black to avoid transparency issues
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, img.width, img.height, cx, cy, img.width * ratio, img.height * ratio);
};

const toGrayscale = (imgData: ImageData): ImageData => {
  const res = createBuffer(imgData.width, imgData.height, imgData.data);
  const d = res.data;
  for (let i = 0; i < d.length; i += 4) {
    const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = avg;     // R
    d[i + 1] = avg; // G
    d[i + 2] = avg; // B
    d[i + 3] = 255; // Alpha (Opaque)
  }
  return res;
};

// Applies Visual Border to Canvas Context (Albedo)
const applyVisualBorder = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, r: number, b: number, l: number, color: string) => {
  if (t <= 0 && r <= 0 && b <= 0 && l <= 0) return;
  ctx.fillStyle = color;
  if (t > 0) ctx.fillRect(0, 0, w, t); // Top
  if (b > 0) ctx.fillRect(0, h - b, w, b); // Bottom
  if (l > 0) ctx.fillRect(0, 0, l, h); // Left
  if (r > 0) ctx.fillRect(w - r, 0, r, h); // Right
};

// Applies data values to specific pixels (Height, Roughness, Metallic)
const applyDataBorder = (imageData: ImageData, t: number, r: number, b: number, l: number, red: number, green: number, blue: number, alpha = 255) => {
  if (t <= 0 && r <= 0 && b <= 0 && l <= 0) return;
  const w = imageData.width;
  const h = imageData.height;
  const d = imageData.data;

  const setP = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = (y * w + x) * 4;
    d[i] = red; 
    d[i + 1] = green; 
    d[i + 2] = blue; 
    d[i + 3] = alpha;
  };

  // Top
  if (t > 0) {
    for (let y = 0; y < t; y++) {
      for (let x = 0; x < w; x++) setP(x, y);
    }
  }
  // Bottom
  if (b > 0) {
    for (let y = 0; y < b; y++) {
      for (let x = 0; x < w; x++) setP(x, h - 1 - y);
    }
  }
  // Left
  if (l > 0) {
    for (let x = 0; x < l; x++) {
      for (let y = 0; y < h; y++) setP(x, y);
    }
  }
  // Right
  if (r > 0) {
    for (let x = 0; x < r; x++) {
      for (let y = 0; y < h; y++) setP(w - 1 - x, y);
    }
  }
};

const generateHeight = (grayData: ImageData, minP: number, maxP: number): ImageData => {
  const w = grayData.width, h = grayData.height;
  const d = grayData.data;
  const res = createBuffer(w, h); // Empty buffer
  const rD = res.data;
  
  const minV = (minP / 100) * 255;
  const maxV = (maxP / 100) * 255;
  const range = maxV - minV || 1;

  for (let i = 0; i < d.length; i += 4) {
    let val = d[i];
    val = Math.max(minV, Math.min(maxV, val));
    val = ((val - minV) / range) * 255;
    
    rD[i] = val;
    rD[i + 1] = val;
    rD[i + 2] = val; 
    rD[i + 3] = 255; // Alpha
  }
  return res;
};

const generateDisplacement = (heightData: ImageData, strength: number): ImageData => {
  const res = createBuffer(heightData.width, heightData.height, heightData.data);
  const d = res.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = d[i];
    v = (v - 128) * strength + 128;
    v = Math.max(0, Math.min(255, v));
    
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v; 
    d[i + 3] = 255;
  }
  return res;
};

const generateRoughness = (heightData: ImageData, offset: number): ImageData => {
  const res = createBuffer(heightData.width, heightData.height);
  const d = heightData.data;
  const rD = res.data;
  const shift = offset * 1.5;

  for (let i = 0; i < d.length; i += 4) {
    let v = 255 - d[i]; 
    v = v + shift;
    v = Math.max(0, Math.min(255, v));
    
    rD[i] = v;
    rD[i + 1] = v;
    rD[i + 2] = v; 
    rD[i + 3] = 255;
  }
  return res;
};

const generateMetallic = (w: number, h: number, value: number): ImageData => {
  const res = createBuffer(w, h);
  const d = res.data;
  const grayVal = Math.floor(value * 255);
  
  for (let i = 0; i < d.length; i += 4) {
    d[i] = grayVal;
    d[i + 1] = grayVal;
    d[i + 2] = grayVal; 
    d[i + 3] = 255;
  }
  return res;
};

const generateAO = (heightData: ImageData, w: number, h: number, strength: number): ImageData => {
  const res = createBuffer(w, h);
  const d = heightData.data;
  const rD = res.data;
  
  for (let i = 0; i < d.length; i += 4) {
    let v = d[i];
    if (strength !== 1.0) {
      let n = v / 255;
      n = Math.pow(n, strength);
      v = n * 255;
    }
    v = Math.max(0, Math.min(255, v));
    
    rD[i] = v;
    rD[i + 1] = v;
    rD[i + 2] = v; 
    rD[i + 3] = 255;
  }
  return res;
};

const generateNormal = (heightData: ImageData, w: number, h: number, strength: number, isDX: boolean): ImageData => {
  const res = createBuffer(w, h);
  const src = heightData.data;
  const dst = res.data;
  const idx = (x: number, y: number) => (y * w + x) * 4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - 1), x2 = Math.min(w - 1, x + 1);
      const y1 = Math.max(0, y - 1), y2 = Math.min(h - 1, y + 1);

      // Using only Red channel [i] as height source
      const tr = src[idx(x2, y1)]; 
      const tl = src[idx(x1, y1)]; 
      const l = src[idx(x1, y)];
      const r = src[idx(x2, y)]; 
      const bl = src[idx(x1, y2)]; 
      const br = src[idx(x2, y2)];
      const t = src[idx(x, y1)]; 
      const b = src[idx(x, y2)];

      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
      const dZ = 255 / Math.max(0.1, strength); // Prevent div by zero

      const len = Math.sqrt(dX * dX + dY * dY + dZ * dZ);
      let nx = (dX / len) * 0.5 + 0.5;
      let ny = (dY / len) * 0.5 + 0.5;
      let nz = (dZ / len) * 0.5 + 0.5;

      if (!isDX) ny = 1.0 - ny;

      const i = idx(x, y);
      dst[i] = nx * 255; 
      dst[i + 1] = ny * 255; 
      dst[i + 2] = nz * 255; 
      dst[i + 3] = 255;
    }
  }
  return res;
};

const imageDataToDataURL = (imageData: ImageData): string => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
    // Use PNG to ensure quality and compatibility, JPEG might cause artifacts or alpha issues
    return canvas.toDataURL('image/jpeg', 0.95);
  }
  return '';
};

// --- Main Export ---

export const generateTextures = async (
  sourceImage: HTMLImageElement,
  params: PBRParams
): Promise<TextureSet> => {
  const [width, height] = params.resolution === Resolution.SQUARE_2K
    ? [2048, 2048]
    : [2048, 1080];

  // 1. Setup Canvas for Initial Albedo Generation (Drawing Image requires Canvas)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error("Failed to create canvas context");

  // 2. Draw Base (Crop/Resize)
  drawCover(ctx, sourceImage, width, height);

  // 3. Apply Visual Border to Albedo (on Canvas)
  applyVisualBorder(ctx, width, height, params.borders.top, params.borders.right, params.borders.bottom, params.borders.left, params.borders.color);
  
  // 4. Extract Albedo Data
  const albedoData = ctx.getImageData(0, 0, width, height);

  // 5. Grayscale & Height Processing (Using pure buffers)
  const grayData = toGrayscale(albedoData);
  
  // Apply PHYSICAL border to grayscale data (Black for Depth)
  applyDataBorder(grayData, params.borders.top, params.borders.right, params.borders.bottom, params.borders.left, 0, 0, 0);

  const heightData = generateHeight(grayData, params.heightMin, params.heightMax);
  // Re-apply border to height data (ensure it's absolute zero/black)
  applyDataBorder(heightData, params.borders.top, params.borders.right, params.borders.bottom, params.borders.left, 0, 0, 0);

  // 6. Derived Maps
  const normalData = generateNormal(heightData, width, height, params.normalStrength, params.normalMode === NormalMode.DX);
  const dispData = generateDisplacement(heightData, params.displacementStrength);
  // Apply border to displacement as well
  applyDataBorder(dispData, params.borders.top, params.borders.right, params.borders.bottom, params.borders.left, 0, 0, 0);
  
  const roughnessData = generateRoughness(heightData, params.roughness);
  // Force Border to be Rough (White)
  applyDataBorder(roughnessData, params.borders.top, params.borders.right, params.borders.bottom, params.borders.left, 255, 255, 255);

  const metallicData = generateMetallic(width, height, params.metallic);
  // Force Border to be Non-Metal (Black)
  applyDataBorder(metallicData, params.borders.top, params.borders.right, params.borders.bottom, params.borders.left, 0, 0, 0);

  const aoData = generateAO(heightData, width, height, params.aoStrength);

  return {
    albedo: imageDataToDataURL(albedoData),
    normal: imageDataToDataURL(normalData),
    roughness: imageDataToDataURL(roughnessData),
    metallic: imageDataToDataURL(metallicData),
    height: imageDataToDataURL(heightData),
    displacement: imageDataToDataURL(dispData),
    ao: imageDataToDataURL(aoData),
  };
};