import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";
import { Download, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { ImageConfig, ProcessedImage } from "@/lib/imageProcessing";

export interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  processed?: ProcessedImage;
  error?: string;
  config: ImageConfig;
  hasTransparency?: boolean;
}

interface ImageCardProps {
  item: ImageItem;
  onRemove: (id: string) => void;
  onDownload: (id: string) => void;
  onConfigChange: (id: string, config: Partial<ImageConfig>) => void;
}

export function ImageCard({ item, onRemove, onDownload, onConfigChange }: ImageCardProps) {
  const isProcessing = item.status === 'processing';
  const isDone = item.status === 'done';
  const isError = item.status === 'error';

  // Calculate estimated size or use actual processed size
  const displaySize = isDone && item.processed 
    ? item.processed.size 
    : item.file.size; // This is a rough estimate, real estimation logic would be complex

  const sizeDiff = isDone && item.processed
    ? ((item.processed.size - item.file.size) / item.file.size) * 100
    : 0;

  return (
    <Card className="overflow-hidden border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <CardContent className="p-0">
        <div className="relative h-48 bg-gray-100 flex items-center justify-center overflow-hidden border-b-2 border-black">
          <img 
            src={isDone && item.processed ? item.processed.previewUrl : item.previewUrl} 
            alt={item.file.name}
            className="max-h-full max-w-full object-contain"
          />

          {(() => {
            const alphaCapableTypes = new Set(["image/png", "image/gif", "image/webp"]);
            const isAlphaCapable = alphaCapableTypes.has(item.file.type);
            const hasTransparency = item.hasTransparency === true;
            const suggestJpg = isAlphaCapable && item.hasTransparency === false;

            if (!hasTransparency && !suggestJpg) return null;

            return (
              <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                {hasTransparency && (
                  <Badge
                    variant="secondary"
                    className="bg-white/80 backdrop-blur-sm border border-black text-black"
                  >
                    含透明像素
                  </Badge>
                )}
                {suggestJpg && (
                  <Badge
                    variant="secondary"
                    className="bg-white/80 backdrop-blur-sm border border-black text-black"
                  >
                    建议转成 JPG
                  </Badge>
                )}
              </div>
            );
          })()}

          {isProcessing && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="font-bold text-sm">处理中...</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 space-y-3">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-bold text-sm truncate flex-1" title={item.file.name}>
              {item.file.name}
            </h3>
            {isDone && (
              <Badge variant={sizeDiff > 0 ? "destructive" : "default"} className={sizeDiff <= 0 ? "bg-green-600 hover:bg-green-700" : ""}>
                {sizeDiff > 0 ? '+' : ''}{sizeDiff.toFixed(1)}%
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>
              <span className="font-bold text-black">原始:</span>
              <div className="font-mono">{formatBytes(item.file.size)}</div>
              <div className="font-mono">{item.originalWidth} x {item.originalHeight}</div>
            </div>
            <div>
              <span className="font-bold text-black">结果:</span>
              <div className="font-mono">{isDone ? formatBytes(item.processed!.size) : '-'}</div>
              <div className="font-mono">
                {isDone 
                  ? `${item.processed!.width} x ${item.processed!.height}` 
                  : `${Math.round(item.originalWidth * item.config.scale)} x ${Math.round(item.originalHeight * item.config.scale)}`
                }
              </div>
            </div>
          </div>

          {isError && (
            <div className="text-destructive text-xs flex items-center gap-1 font-bold">
              <AlertCircle className="w-3 h-3" />
              {item.error || '处理失败'}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 border-black hover:bg-gray-100"
              onClick={() => onDownload(item.id)}
              disabled={!isDone}
            >
              <Download className="w-4 h-4 mr-1" />
              下载
            </Button>
            <Button 
              variant="destructive" 
              size="icon"
              className="h-9 w-9 border-black"
              onClick={() => onRemove(item.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
