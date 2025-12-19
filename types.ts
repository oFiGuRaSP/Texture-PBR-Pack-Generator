export enum Resolution {
  SQUARE_2K = '2048x2048',
  WIDE_2K = '2048x1080',
}

export enum NormalMode {
  DX = 'DX',
  GL = 'GL',
}

export interface BorderSettings {
  top: number;
  bottom: number;
  left: number;
  right: number;
  linked: boolean;
  color: string;
}

export interface PBRParams {
  resolution: Resolution;
  normalStrength: number;
  normalMode: NormalMode;
  displacementStrength: number;
  heightMin: number;
  heightMax: number;
  roughness: number;
  metallic: number;
  aoStrength: number;
  borders: BorderSettings;
}

export interface TextureSet {
  albedo: string; // Data URL
  normal: string;
  roughness: string;
  metallic: string;
  height: string;
  displacement: string; // Added displacement
  ao: string;
}