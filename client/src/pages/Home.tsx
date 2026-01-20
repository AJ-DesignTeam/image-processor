import { useState, useCallback, useEffect } from 'react';
// import { useDropzone } from 'react-dropzone'; // Removed unused import
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageCard, ImageItem } from "@/components/ImageCard";
import { processImage, ImageConfig, loadImage, hasTransparency } from "@/lib/imageProcessing";
import { saveAs } from 'file-saver';
import { Upload, Download, Trash2, Settings2, Image as ImageIcon, RefreshCw } from "lucide-react";
import { nanoid } from 'nanoid';
import { toast } from "sonner";

export default function Home() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [globalConfig, setGlobalConfig] = useState<ImageConfig>({
    quality: 0.8,
    scale: 1,
    format: 'image/jpeg'
  });
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  // Manual Dropzone implementation since we didn't install react-dropzone
  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    await handleFiles(files);
  }, [globalConfig]);

  const onFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      await handleFiles(files);
    }
  }, [globalConfig]);

  const handleFiles = async (files: File[]) => {
    const newItems: ImageItem[] = [];

    for (const file of files) {
      try {
        const img = await loadImage(file);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        let isTransparent = false;
        
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          isTransparent = hasTransparency(ctx, img.width, img.height);
        }

        newItems.push({
          id: nanoid(),
          file,
          previewUrl: img.src, // loadImage creates object URL
          originalWidth: img.width,
          originalHeight: img.height,
          status: 'pending',
          config: { ...globalConfig },
          hasTransparency: isTransparent
        });
      } catch (err) {
        console.error('Error loading image:', err);
        toast.error(`Failed to load ${file.name}`);
      }
    }

    setItems(prev => [...prev, ...newItems]);
  };

  const updateItemConfig = (id: string, config: Partial<ImageConfig>) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, config: { ...item.config, ...config }, status: 'pending' };
      }
      return item;
    }));
  };

  const updateItemFormatOverride = (id: string, formatOverride: ImageConfig["format"] | null) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const effectiveFormat = formatOverride ?? globalConfig.format;

      return {
        ...item,
        formatOverride,
        config: { ...item.config, format: effectiveFormat },
        status: 'pending',
      };
    }));
  };

  const removeItem = (id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.processed) URL.revokeObjectURL(item.processed.previewUrl);
      }
      return prev.filter(i => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach(item => {
      URL.revokeObjectURL(item.previewUrl);
      if (item.processed) URL.revokeObjectURL(item.processed.previewUrl);
    });
    setItems([]);
  };

  const processItem = async (item: ImageItem) => {
    if (item.status === 'processing') return;

    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' } : i));

    try {
      const processed = await processImage(item.file, item.config);
      setItems(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: 'done', 
        processed,
        error: undefined
      } : i));
    } catch (err) {
      console.error('Processing error:', err);
      setItems(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: 'error', 
        error: err instanceof Error ? err.message : 'Unknown error' 
      } : i));
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    const pendingItems = items.filter(i => i.status !== 'done');
    
    for (const item of pendingItems) {
      await processItem(item);
    }
    setIsProcessingAll(false);
    toast.success('所有图片处理完成');
  };

  const downloadItem = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (item.status !== 'done') {
      await processItem(item);
    }

    // Re-find item as it might have been updated
    const updatedItem = items.find(i => i.id === id); // This won't work due to closure, need to use ref or state correctly. 
    // Actually, processItem updates state, but we can't access new state immediately here.
    // So we should probably just re-process or wait for state update.
    // For simplicity, let's just re-process if not done, or use the processed blob if done.
    
    // Better approach:
    // If it was already done, use it. If not, process it and use the result directly.
    let blob = item.processed?.blob;
    let extension = item.config.format === 'image/jpeg' ? 'jpg' : 'png';
    
    if (item.config.format === 'original') {
       extension = item.file.name.split('.').pop() || 'png';
    }

    if (!blob) {
       try {
         const res = await processImage(item.file, item.config);
         blob = res.blob;
         // Update state too
         setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'done', processed: res } : i));
       } catch (e) {
         toast.error('处理图片下载失败');
         return;
       }
    }

    saveAs(blob, `processed_${item.file.name.split('.')[0]}.${extension}`);
  };

  const downloadAll = async () => {
    setIsProcessingAll(true);
    let processedCount = 0;

    for (const item of items) {
      let blob = item.processed?.blob;
      let extension = item.config.format === 'image/jpeg' ? 'jpg' : 'png';
      if (item.config.format === 'original') {
         extension = item.file.name.split('.').pop() || 'png';
      }

      if (!blob) {
        try {
          const res = await processImage(item.file, item.config);
          blob = res.blob;
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', processed: res } : i));
        } catch (e) {
          console.error(`Failed to process ${item.file.name}`);
          continue;
        }
      }

      saveAs(blob, `processed_${item.file.name.split('.')[0]}.${extension}`);
      processedCount++;
      // Small delay to prevent browser blocking
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    setIsProcessingAll(false);
    toast.success(`已下载 ${processedCount} 张图片`);
  };

  // Update global config affects all pending items
  // Note: 单图 formatOverride 的优先级高于全局设置
  const updateGlobalConfig = (config: Partial<ImageConfig>) => {
    const newConfig = { ...globalConfig, ...config };
    setGlobalConfig(newConfig);

    const { format, ...rest } = config;

    setItems(prev => prev.map(item => {
      const nextConfig = { ...item.config, ...rest };

      // 只有当本图没有单图覆盖时，才同步全局 format
      if (format && item.formatOverride !== "image/jpeg") {
        nextConfig.format = format;
      }

      return {
        ...item,
        config: nextConfig,
        status: 'pending', // Reset status to trigger re-process if needed
      };
    }));
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="border-b-4 border-black bg-white sticky top-0 z-50">
        <div className="container mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-bold text-2xl">
              <img
                src={`${import.meta.env.BASE_URL}images/logo.png`}
                alt="Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="h-12 flex items-center">
              <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">安久图片处理工具</h1>
            </div>
          </div>
          <div className="flex gap-4">
            {/* 顶部栏“上传图片”按钮：按需再打开
            <Button
              variant="outline"
              className="border-2 border-black font-bold hover:bg-black hover:text-white transition-colors"
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              上传图片
            </Button>
            */}
            <input
              id="file-upload"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={onFileSelect}
            />
          </div>
        </div>
      </header>

      {/* Hero / Controls */}
      <div className="border-b-4 border-black bg-gray-50">
        <div className="container mx-auto py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Global Controls */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white border-2 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center gap-2 mb-6 border-b-2 border-black pb-2">
                  <Settings2 className="w-5 h-5" />
                  <h2 className="font-bold uppercase tracking-wide">全局设置</h2>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-sm font-bold uppercase">质量</label>
                      <span className="font-mono font-bold bg-black text-white px-2 text-xs flex items-center">
                        {Math.round(globalConfig.quality * 100)}%
                      </span>
                    </div>
                    <Slider 
                      value={[globalConfig.quality]} 
                      min={0.1} 
                      max={1} 
                      step={0.05}
                      onValueChange={([val]) => updateGlobalConfig({ quality: val })}
                      className="py-2"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-sm font-bold uppercase">缩放</label>
                      <span className="font-mono font-bold bg-black text-white px-2 text-xs flex items-center">
                        {Math.round(globalConfig.scale * 100)}%
                      </span>
                    </div>
                    <Slider 
                      value={[globalConfig.scale]} 
                      min={0.1} 
                      max={2} 
                      step={0.1}
                      onValueChange={([val]) => updateGlobalConfig({ scale: val })}
                      className="py-2"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase">格式</label>
                    <Select 
                      value={globalConfig.format} 
                      onValueChange={(val: any) => updateGlobalConfig({ format: val })}
                    >
                      <SelectTrigger className="border-2 border-black font-bold rounded-none focus:ring-0 focus:ring-offset-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-2 border-black rounded-none">
                        <SelectItem value="image/jpeg">JPEG (标准)</SelectItem>
                        {/* <SelectItem value="image/png">PNG (无损)</SelectItem> */}
                        <SelectItem value="image/png-lossy">PNG (有损/索引色)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3">
                  <Button 
                    className="w-full bg-black text-white hover:bg-primary border-2 border-black font-bold rounded-none h-12 text-lg shadow-[4px_4px_0px_0px_rgba(100,100,100,0.5)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                    onClick={processAll}
                    disabled={isProcessingAll || items.length === 0}
                  >
                    {isProcessingAll ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <Settings2 className="w-5 h-5 mr-2" />}
                    全部处理
                  </Button>
                  <Button 
                    className="w-full bg-white text-black hover:bg-gray-100 border-2 border-black font-bold rounded-none h-12 text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                    onClick={downloadAll}
                    disabled={items.length === 0}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    全部下载
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full text-primary hover:bg-primary/10 hover:text-primary font-bold uppercase text-xs tracking-widest"
                    onClick={clearAll}
                    disabled={items.length === 0}
                  >
                    清空全部
                  </Button>
                </div>
              </div>
            </div>

            {/* Upload Area / Stats */}
            <div className="lg:col-span-8 flex flex-col">
              <div 
                className={`flex-1 border-4 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-12 transition-colors ${items.length === 0 ? 'bg-white' : 'bg-transparent border-transparent p-0'}`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={onDrop}
              >
                {items.length === 0 ? (
                  <div className="text-center space-y-6 max-w-md">
                    <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center mx-auto text-white mb-6 shadow-xl">
                      <Upload className="w-10 h-10" />
                    </div>
                    <h3 className="text-3xl font-black uppercase tracking-tight">拖拽图片到这里</h3>
                    <p className="text-gray-500 font-medium">
                      支持 JPG, PNG, WebP。所有处理均在本地浏览器完成。
                    </p>
                    <Button 
                      size="lg" 
                      className="bg-black text-white hover:bg-gray-800 font-bold px-8 py-6 text-lg rounded-full"
                      onClick={() => document.getElementById('file-upload')?.click()}
                    >
                      选择文件
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
                    {items.map(item => (
                      <ImageCard 
                        key={item.id} 
                        item={item} 
                        onRemove={removeItem}
                        onDownload={downloadItem}
                        onConfigChange={updateItemConfig}
                        onFormatOverrideChange={updateItemFormatOverride}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="container mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="font-bold text-lg mb-4 uppercase tracking-wider border-b border-white/20 pb-2">功能特点</h4>
            <ul className="text-gray-400 text-sm grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2">
              <li className="flex items-center gap-2"><span aria-hidden>•</span>智能压缩</li>
              <li className="flex items-center gap-2"><span aria-hidden>•</span>批量处理</li>
              <li className="flex items-center gap-2"><span aria-hidden>•</span>格式转换</li>
              <li className="flex items-center gap-2"><span aria-hidden>•</span>安全隐私</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-lg mb-4 uppercase tracking-wider border-b border-white/20 pb-2">关于工具</h4>
            <p className="text-gray-400 text-sm leading-relaxed">
              工具所有处理直接在您的浏览器中进行。您的图片永远不会上传到任何服务器。
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
