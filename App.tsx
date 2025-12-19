import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { PBRParams, Resolution, NormalMode, TextureSet } from './types';
import { generateTextures } from './services/textureGenerator';
import Preview3D from './components/Preview3D';

// Custom SVG Backgrounds for Drag Area
const BG_DEFAULT = "url(\"data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='10' ry='10' stroke='%23CBD5E1FF' stroke-width='2' stroke-dasharray='10%2c 10' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e\")";
const BG_ACTIVE = "url(\"data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='10' ry='10' stroke='%2322C55EFF' stroke-width='3' stroke-dasharray='10%2c 10' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e\")";
const BG_ERROR = "url(\"data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='10' ry='10' stroke='%23EF4444FF' stroke-width='3' stroke-dasharray='10%2c 10' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e\")";

const DEFAULT_PARAMS: PBRParams = {
  resolution: Resolution.SQUARE_2K,
  normalStrength: 1.5, // Reduced from 2.2 for less noise
  normalMode: NormalMode.DX,
  displacementStrength: 2.2, // Updated default
  heightMin: 20, // Updated default
  heightMax: 80, // Updated default
  roughness: 0,
  metallic: 0.0,
  aoStrength: 1.0,
  borders: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    linked: true,
    color: '#808080',
  },
};

const ResetBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button 
    onClick={onClick}
    className="ml-2 w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700 dark:hover:text-blue-400 transition-all"
    title="Restaurar padrão"
  >
    <i className="fa-solid fa-rotate-left text-[10px]"></i>
  </button>
);

const App: React.FC = () => {
  // State
  const [materialName, setMaterialName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState('');
  const [params, setParams] = useState<PBRParams>(DEFAULT_PARAMS);
  const [generatedTextures, setGeneratedTextures] = useState<TextureSet | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [dragState, setDragState] = useState<'default' | 'active' | 'error'>('default');
  
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('theme');
        return saved === 'dark';
    }
    return false;
  });

  // Refs
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effects
  useEffect(() => {
    if (darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Debounced Generation
  useEffect(() => {
    if (!sourceImage) return;

    const timer = setTimeout(async () => {
      // Only auto-generate if preview is active to save resources, similar to original code "tryUpdatePreview"
      if (showPreview) {
        setIsProcessing(true);
        try {
          const textures = await generateTextures(sourceImage, params);
          setGeneratedTextures(textures);
        } catch (err) {
          console.error("Generation failed", err);
        } finally {
          setIsProcessing(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [sourceImage, params, showPreview]);

  // Handlers
  const handleImage = (file: File) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setDragState('error');
      setTimeout(() => setDragState('default'), 2000);
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setSourceImage(img);
        setImageName(file.name);
        setGeneratedTextures(null);
        setShowPreview(false); // Reset preview
        setDragState('default');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const updateParam = <K extends keyof PBRParams>(key: K, value: PBRParams[K]) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const updateBorder = (key: keyof typeof DEFAULT_PARAMS.borders, value: number | boolean | string) => {
    setParams(prev => {
      const newBorders = { ...prev.borders };
      if (key === 'linked' && typeof value === 'boolean') {
        newBorders.linked = value;
      } else if (key === 'color' && typeof value === 'string') {
        newBorders.color = value;
      } else if (typeof value === 'number') {
        if (newBorders.linked) {
          newBorders.top = value;
          newBorders.bottom = value;
          newBorders.left = value;
          newBorders.right = value;
        } else {
          // @ts-ignore
          newBorders[key] = value;
        }
      }
      return { ...prev, borders: newBorders };
    });
  };

  const resetSliders = () => {
    setParams(DEFAULT_PARAMS);
  };

  const handleGenerateZip = async () => {
    if (!materialName.trim()) {
      setNameError(true);
      nameInputRef.current?.focus();
      return;
    }
    if (!sourceImage) return;
    
    setIsProcessing(true);
    // Force generation even if not previewing
    const textures = await generateTextures(sourceImage, params);
    
    const zip = new JSZip();
    const cleanName = materialName.replace(/[^a-z0-9]/gi, '_'); // Allow uppercase for file name but maybe keep casing

    // Helper to add base64 data to zip
    const addToZip = (suffix: string, dataUrl: string, isJpg = false) => {
      const data = dataUrl.split(',')[1];
      zip.file(`${cleanName}_${suffix}.${isJpg ? 'jpg' : 'png'}`, data, { base64: true });
    };

    addToZip('Albedo', textures.albedo, true); // Original code saves preview/albedo as jpg? Let's check. Yes preview logic uses jpg 0.9.
    addToZip('Normal', textures.normal);
    addToZip('Roughness', textures.roughness);
    addToZip('Metallic', textures.metallic);
    addToZip('Height', textures.height);
    addToZip('Displacement', textures.displacement); // Save calculated displacement
    addToZip('AO', textures.ao);
    
    const content = await zip.generateAsync({ type: 'blob' });
    FileSaver.saveAs(content, `${cleanName}_D5_PBR.zip`);
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans p-4 md:p-8 transition-colors duration-300">
      
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-xl shadow-lg overflow-hidden border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="bg-slate-900 dark:bg-black text-white p-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2"><i className="fa-solid fa-cubes-stacked mr-2"></i>PBR Texture Pack Generator</h1>
            <p className="text-slate-300 text-sm">
              Ferramenta Client-Side para criar materiais D5 Render. Carregue uma textura, configure todos os mapas PBR e baixe um ZIP pronto.
            </p>
          </div>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="text-slate-400 hover:text-white transition-colors"
            title="Toggle Dark Mode"
          >
            <i className={`fa-solid ${darkMode ? 'fa-sun' : 'fa-moon'} text-xl`}></i>
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* 1. Nome do Material */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              1. Nome do Material <span className="text-red-500">*</span>
            </label>
            <input 
              ref={nameInputRef}
              type="text" 
              placeholder="Ex: Piso_Madeira_01" 
              value={materialName}
              onChange={(e) => {
                const val = e.target.value.replace(/[^A-Za-z0-9_-]/g, '_');
                setMaterialName(val);
                setNameError(false);
              }}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition bg-white dark:bg-slate-800 text-slate-900 dark:text-white ${
                nameError ? 'border-red-500 ring-2 ring-red-200 dark:ring-red-900' : 'border-slate-300 dark:border-slate-700'
              }`}
              maxLength={40}
            />
            <div className="flex justify-between items-start mt-1">
               <p className="text-xs text-slate-500 dark:text-slate-400">Apenas letras, números, hífen e underline.</p>
               {nameError && (
                 <p className="text-xs text-red-600 dark:text-red-400 font-bold animate-pulse">
                   <i className="fa-solid fa-triangle-exclamation mr-1"></i>Adicione um nome ao material
                 </p>
               )}
            </div>
          </div>

          {/* 2. Upload Drag & Drop */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">2. Imagem Base (Albedo)</label>
            
            <div 
              className={`relative w-full h-48 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group ${
                 dragState === 'active' ? 'bg-green-50 dark:bg-green-900/20' : 
                 dragState === 'error' ? 'bg-red-50 dark:bg-red-900/20' : ''
              }`}
              style={{ 
                backgroundImage: dragState === 'active' ? BG_ACTIVE : dragState === 'error' ? BG_ERROR : BG_DEFAULT 
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragState('active'); }}
              onDragLeave={() => setDragState('default')}
              onDrop={(e) => {
                e.preventDefault();
                setDragState('default');
                if (e.dataTransfer.files?.[0]) handleImage(e.dataTransfer.files[0]);
              }}
            >
              <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg" onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])} />
              
              {!sourceImage ? (
                <div className="text-center pointer-events-none text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                   <i className="fa-solid fa-cloud-arrow-up text-4xl mb-3 group-hover:scale-110 transition-transform"></i>
                   <p className="font-medium">Arraste sua imagem aqui</p>
                   <p className="text-xs mt-1">ou clique para procurar (JPG/PNG)</p>
                   {dragState === 'error' && <p className="text-red-500 font-bold mt-2">Apenas arquivos JPG ou PNG!</p>}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-xl z-10 pointer-events-none">
                   <div className="bg-green-100 dark:bg-green-900 p-3 rounded-full mb-2">
                       <i className="fa-solid fa-check text-green-600 dark:text-green-400 text-2xl"></i>
                   </div>
                   <p className="font-bold text-slate-800 dark:text-slate-200 text-sm px-4 truncate max-w-full">{imageName}</p>
                   <p className="text-xs text-green-600 dark:text-green-400 font-bold mt-1">Imagem Carregada!</p>
                </div>
              )}
            </div>
          </div>

          {/* 3. Configurações */}
          <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
             <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200"><i className="fa-solid fa-sliders mr-2"></i>Parâmetros D5 Render</h3>
                <button onClick={resetSliders} className="text-xs text-blue-500 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer">Resetar Tudo</button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               
               {/* Left Col: Geometry */}
               <div className="space-y-5">
                 <h4 className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1 mb-3">Geometria (Relevo)</h4>
                 
                 {/* Resolution */}
                 <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Resolução de Saída</label>
                        {params.resolution !== DEFAULT_PARAMS.resolution && (
                            <ResetBtn onClick={() => updateParam('resolution', DEFAULT_PARAMS.resolution)} />
                        )}
                    </div>
                    <div className="flex gap-2 mb-3">
                      {[Resolution.SQUARE_2K, Resolution.WIDE_2K].map((res) => (
                        <label key={res} className={`flex-1 flex items-center justify-center p-2 border rounded cursor-pointer transition text-sm ${params.resolution === res ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-blue-400'}`}>
                          <input type="radio" name="res" className="mr-2 accent-blue-600" checked={params.resolution === res} onChange={() => updateParam('resolution', res)} />
                          {res === Resolution.SQUARE_2K ? '2K Quadrado' : '2K Wide'}
                        </label>
                      ))}
                    </div>
                 </div>

                 {/* Borders D-Pad */}
                 <div>
                    <div className="flex justify-between items-center mb-2">
                       <div className="flex items-center">
                           <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-2">Borda Independente (Rejunte)</label>
                           <ResetBtn onClick={() => updateParam('borders', DEFAULT_PARAMS.borders)} />
                       </div>
                       <span className="text-[10px] text-slate-400">Valores em pixels</span>
                    </div>
                    <div className="flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 relative mt-2">
                       <button 
                         onClick={() => updateBorder('linked', !params.borders.linked)}
                         className={`absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full transition ${params.borders.linked ? 'bg-transparent text-blue-500' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}
                         title="Vincular Lados"
                       >
                         <i className={`fa-solid ${params.borders.linked ? 'fa-link' : 'fa-link-slash'}`}></i>
                       </button>

                       {/* Top */}
                       <div className="mb-2 relative group">
                          <input type="number" min="0" max="200" value={params.borders.top} onChange={(e) => updateBorder('top', parseInt(e.target.value)||0)} className="w-16 h-10 text-center text-sm font-bold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded focus:border-blue-500 outline-none" placeholder="0" />
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-slate-400 font-bold uppercase">Topo</div>
                       </div>
                       
                       <div className="flex items-center gap-3">
                          <div className="relative group">
                             <input type="number" min="0" max="200" value={params.borders.left} onChange={(e) => updateBorder('left', parseInt(e.target.value)||0)} className="w-16 h-10 text-center text-sm font-bold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded focus:border-blue-500 outline-none" placeholder="0" />
                             <div className="absolute -left-6 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-bold uppercase -rotate-90">Esq</div>
                          </div>
                          <div className="relative group">
                             <input type="color" value={params.borders.color} onChange={(e) => updateBorder('color', e.target.value)} className="w-12 h-12 rounded-lg cursor-pointer border-2 border-white dark:border-slate-600 shadow-sm p-0 overflow-hidden hover:scale-105 transition" />
                          </div>
                          <div className="relative group">
                             <input type="number" min="0" max="200" value={params.borders.right} onChange={(e) => updateBorder('right', parseInt(e.target.value)||0)} className="w-16 h-10 text-center text-sm font-bold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded focus:border-blue-500 outline-none" placeholder="0" />
                             <div className="absolute -right-6 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-bold uppercase rotate-90">Dir</div>
                          </div>
                       </div>

                       <div className="mt-2 relative group">
                          <input type="number" min="0" max="200" value={params.borders.bottom} onChange={(e) => updateBorder('bottom', parseInt(e.target.value)||0)} className="w-16 h-10 text-center text-sm font-bold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded focus:border-blue-500 outline-none" placeholder="0" />
                          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-slate-400 font-bold uppercase">Baixo</div>
                       </div>
                    </div>
                 </div>

                 {/* Normal Map */}
                 <div className="pt-2">
                    <div className="flex justify-between items-center mb-1">
                       <div className="flex items-center">
                           <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-2">Normal</label>
                           {(params.normalStrength !== DEFAULT_PARAMS.normalStrength || params.normalMode !== DEFAULT_PARAMS.normalMode) && (
                                <ResetBtn onClick={() => { updateParam('normalStrength', DEFAULT_PARAMS.normalStrength); updateParam('normalMode', DEFAULT_PARAMS.normalMode); }} />
                           )}
                       </div>
                       <div className="flex bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 text-[10px] font-bold overflow-hidden">
                          <button onClick={() => updateParam('normalMode', NormalMode.DX)} className={`px-2 py-0.5 transition ${params.normalMode === NormalMode.DX ? 'bg-slate-800 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'}`}>DX</button>
                          <button onClick={() => updateParam('normalMode', NormalMode.GL)} className={`px-2 py-0.5 transition ${params.normalMode === NormalMode.GL ? 'bg-slate-800 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'}`}>GL</button>
                       </div>
                    </div>
                    <div className="flex justify-between mb-1">
                       <span className="text-[10px] text-slate-400">Suave</span>
                       <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{params.normalStrength.toFixed(1)}</span>
                       <span className="text-[10px] text-slate-400">Forte</span>
                    </div>
                    <input type="range" min="0.5" max="6.0" step="0.1" value={params.normalStrength} onChange={(e) => updateParam('normalStrength', parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                 </div>

                 {/* Displacement */}
                 <div>
                    <div className="flex justify-between mb-1">
                       <div className="flex items-center">
                           <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-2">Displacement</label>
                           {params.displacementStrength !== DEFAULT_PARAMS.displacementStrength && (
                               <ResetBtn onClick={() => updateParam('displacementStrength', DEFAULT_PARAMS.displacementStrength)} />
                           )}
                       </div>
                       <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{params.displacementStrength.toFixed(1)}</span>
                    </div>
                    <input type="range" min="0.0" max="5.0" step="0.1" value={params.displacementStrength} onChange={(e) => updateParam('displacementStrength', parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                 </div>

                 {/* Height Levels */}
                 <div>
                    <div className="flex justify-between mb-1">
                       <div className="flex items-center">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-2">Height Levels (Base)</label>
                            {(params.heightMin !== DEFAULT_PARAMS.heightMin || params.heightMax !== DEFAULT_PARAMS.heightMax) && (
                                <ResetBtn onClick={() => { updateParam('heightMin', DEFAULT_PARAMS.heightMin); updateParam('heightMax', DEFAULT_PARAMS.heightMax); }} />
                            )}
                       </div>
                       <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{params.heightMin} / {params.heightMax}</span>
                    </div>
                    <div className="flex gap-2">
                       <input type="range" min="0" max="100" value={params.heightMin} onChange={(e) => { const v = parseInt(e.target.value); if(v < params.heightMax) updateParam('heightMin', v)}} className="w-1/2 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-500" title="Preto (Min)" />
                       <input type="range" min="0" max="100" value={params.heightMax} onChange={(e) => { const v = parseInt(e.target.value); if(v > params.heightMin) updateParam('heightMax', v)}} className="w-1/2 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" title="Branco (Max)" />
                    </div>
                 </div>
               </div>

               {/* Right Col: Finish */}
               <div className="space-y-5">
                 <h4 className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1 mb-3">Acabamento (Superfície)</h4>
                 
                 {/* Roughness */}
                 <div>
                    <div className="flex justify-between mb-1">
                       <div className="flex items-center">
                           <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-2">Roughness (Rugosidade)</label>
                           {params.roughness !== DEFAULT_PARAMS.roughness && (
                                <ResetBtn onClick={() => updateParam('roughness', DEFAULT_PARAMS.roughness)} />
                           )}
                       </div>
                       <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{params.roughness}%</span>
                    </div>
                    <div className="flex justify-between mb-1 text-[10px] text-slate-400">
                        <span>- Brilho</span>
                        <span>+ Fosco</span>
                    </div>
                    <input type="range" min="-100" max="100" step="5" value={params.roughness} onChange={(e) => updateParam('roughness', parseInt(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                 </div>

                 {/* Metallic */}
                 <div>
                    <div className="flex justify-between mb-1">
                       <div className="flex items-center">
                           <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-2">Metallic (Metálico)</label>
                           {params.metallic !== DEFAULT_PARAMS.metallic && (
                                <ResetBtn onClick={() => updateParam('metallic', DEFAULT_PARAMS.metallic)} />
                           )}
                       </div>
                       <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{params.metallic.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between mb-1 text-[10px] text-slate-400">
                        <span>Não-Metal</span>
                        <span>Metal</span>
                    </div>
                    <input type="range" min="0.0" max="1.0" step="0.05" value={params.metallic} onChange={(e) => updateParam('metallic', parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                 </div>

                 {/* AO */}
                 <div>
                    <div className="flex justify-between mb-1">
                       <div className="flex items-center">
                           <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-2">Ambient Occlusion (AO)</label>
                           {params.aoStrength !== DEFAULT_PARAMS.aoStrength && (
                                <ResetBtn onClick={() => updateParam('aoStrength', DEFAULT_PARAMS.aoStrength)} />
                           )}
                       </div>
                       <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{params.aoStrength.toFixed(1)}</span>
                    </div>
                    <input type="range" min="0.0" max="2.0" step="0.1" value={params.aoStrength} onChange={(e) => updateParam('aoStrength', parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                 </div>
               </div>

             </div>
          </div>

          {/* 4. Visualizar */}
          <div className="pt-2">
             {!showPreview ? (
               <button onClick={() => { if(!sourceImage) return; setShowPreview(true); }} className="w-full py-3 px-6 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-700 text-white font-bold rounded-lg shadow-md transition flex items-center justify-center gap-2 mb-3">
                  <i className="fa-solid fa-eye"></i> Visualizar 3D (Tempo Real)
               </button>
             ) : (
                <div className="mb-4 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative group h-[400px]">
                  <div className="absolute top-3 left-3 bg-white/80 dark:bg-black/50 backdrop-blur px-3 py-1 rounded text-xs font-bold text-slate-600 dark:text-slate-300 z-10 shadow-sm pointer-events-none select-none">
                      <i className="fa-solid fa-cube mr-1"></i> Preview 3D (Arraste para girar)
                  </div>
                  
                  <button onClick={() => setAutoRotate(!autoRotate)} className="absolute top-3 right-3 bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70 backdrop-blur px-3 py-1 rounded text-xs font-bold text-slate-700 dark:text-slate-300 z-10 shadow-sm cursor-pointer transition select-none flex items-center gap-2">
                      <i className={`fa-solid ${autoRotate ? 'fa-pause' : 'fa-play'}`}></i> <span>{autoRotate ? 'Pausar' : 'Girar'}</span>
                  </button>

                  <Preview3D 
                     textures={generatedTextures} 
                     autoRotate={autoRotate}
                     displacementScale={params.displacementStrength}
                  />

                  {isProcessing && (
                     <div className="absolute inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center z-20 backdrop-blur-sm">
                       <div className="text-blue-600 dark:text-blue-400 text-lg font-bold flex flex-col items-center animate-pulse">
                         <i className="fa-solid fa-circle-notch fa-spin text-2xl mb-2"></i>
                         <span>Gerando Texturas...</span>
                       </div>
                     </div>
                   )}
                </div>
             )}
          </div>

          {/* 5. Ações Finais */}
          <div className="flex flex-col sm:flex-row gap-3">
             <button 
               onClick={handleGenerateZip}
               disabled={!sourceImage || isProcessing}
               className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
             >
               <i className={`fa-solid ${isProcessing ? 'fa-circle-notch fa-spin' : 'fa-gears'}`}></i> 
               {isProcessing ? 'Processando...' : 'Gerar ZIP'}
             </button>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
             <p className="text-sm text-slate-600 dark:text-slate-400 font-medium mb-1">
               Desenvolvido por <span className="text-slate-800 dark:text-slate-200 font-bold">Alexandre Nerdido</span>
             </p>
             <p className="text-xs text-slate-400 dark:text-slate-500">
               &copy; 2025 Alexandre Nerdido. Todos os direitos reservados.
             </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;