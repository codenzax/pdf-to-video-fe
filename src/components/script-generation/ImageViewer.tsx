import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { ImageData } from '@/services/grobidApi'
import { API_BASE_URL } from '@/lib/env'

interface ImageViewerProps {
  images: ImageData[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onNext: () => void
  onPrevious: () => void
  sessionId?: string
}

export function ImageViewer({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNext,
  onPrevious,
  sessionId,
}: ImageViewerProps) {
  const [zoom, setZoom] = useState(1.0)
  const currentImage = images[currentIndex]

  if (!currentImage) return null

  // Construct image URL
  const getImageUrl = () => {
    if (sessionId && currentImage.filename) {
      // API_BASE_URL already includes /api/v1, so just add /pdf/session/...
      const baseUrl = API_BASE_URL.replace(/\/+$/, '')
      return `${baseUrl}/pdf/session/${sessionId}/images/${currentImage.filename}`
    }
    // If filename not available, try to extract from path
    if (currentImage.path && sessionId) {
      const pathParts = currentImage.path.split(/[/\\]/)
      const filename = pathParts[pathParts.length - 1]
      if (filename) {
        const baseUrl = API_BASE_URL.replace(/\/+$/, '')
        return `${baseUrl}/pdf/session/${sessionId}/images/${filename}`
      }
    }
    // Fallback to path if available (for direct file paths)
    return currentImage.path || ''
  }

  const imageUrl = getImageUrl()

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3.0))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5))
  }

  const handleResetZoom = () => {
    setZoom(1.0)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0 border-b">
          <DialogTitle className="text-lg font-semibold">
            {currentImage.caption || currentImage.title || `Figure ${currentIndex + 1}`}
          </DialogTitle>
        </DialogHeader>
        
        <div className="relative flex-1 overflow-hidden bg-black/5 dark:bg-black/20 min-h-0 flex flex-col">
          {/* Image Container */}
          <div className="relative w-full flex-1 min-h-[400px] flex items-center justify-center overflow-auto">
            {imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt={currentImage.caption || currentImage.title || 'Figure'}
                  className="max-w-full max-h-full object-contain transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                  onError={(e) => {
                    console.error('Failed to load image:', {
                      url: imageUrl,
                      filename: currentImage.filename,
                      path: currentImage.path,
                      sessionId: sessionId
                    })
                    const target = e.currentTarget as HTMLImageElement
                    target.style.display = 'none'
                    // Show error message
                    const errorDiv = document.createElement('div')
                    errorDiv.className = 'text-center text-red-500 p-4'
                    errorDiv.innerHTML = `
                      <p class="font-semibold">Failed to load image</p>
                      <p class="text-xs mt-2">Filename: ${currentImage.filename || 'N/A'}</p>
                      <p class="text-xs">Check console for details</p>
                    `
                    target.parentElement?.appendChild(errorDiv)
                  }}
                  onLoad={() => {
                    console.log('Image loaded successfully:', imageUrl)
                  }}
                />
              </>
            ) : (
              <div className="text-center text-muted-foreground p-8">
                <p className="font-semibold">Image not available</p>
                <p className="text-xs mt-2">
                  Filename: {currentImage.filename || 'Not set'}
                </p>
                <p className="text-xs">
                  Path: {currentImage.path || 'Not set'}
                </p>
                {currentImage.description && (
                  <p className="text-sm mt-4">{currentImage.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Navigation Controls */}
          <div className="absolute top-1/2 left-4 transform -translate-y-1/2">
            <Button
              variant="secondary"
              size="icon"
              onClick={onPrevious}
              disabled={currentIndex === 0}
              className="rounded-full bg-black/50 hover:bg-black/70 text-white border-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="absolute top-1/2 right-4 transform -translate-y-1/2">
            <Button
              variant="secondary"
              size="icon"
              onClick={onNext}
              disabled={currentIndex === images.length - 1}
              className="rounded-full bg-black/50 hover:bg-black/70 text-white border-0"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Zoom Controls */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-lg px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className="h-8 w-8 text-white hover:bg-white/20"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-white text-sm min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoom >= 3.0}
              className="h-8 w-8 text-white hover:bg-white/20"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetZoom}
              className="h-8 px-3 text-white hover:bg-white/20 ml-2"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Image Info */}
        <div className="px-6 py-4 border-t bg-muted/30 flex-shrink-0 flex flex-col" style={{ maxHeight: '35vh' }}>
          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4">
            {currentImage.description && (
              <div className="space-y-2 w-full">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide sticky top-0 bg-muted/30 py-1.5 -mx-2 px-2 rounded z-10 text-center">
                  Description
                </h4>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words w-full text-center overflow-x-hidden">
                  {currentImage.description}
                </div>
              </div>
            )}
            
            {/* Key Insights */}
            {currentImage.key_insights && currentImage.key_insights.length > 0 && (
              <div className="space-y-2 w-full">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide sticky top-0 bg-muted/30 py-1.5 -mx-2 px-2 rounded z-10 text-center">
                  Key Insights
                </h4>
                <ul className="text-sm text-foreground space-y-1.5 list-none ml-0 w-full text-center">
                  {currentImage.key_insights.map((insight, idx) => (
                    <li key={idx} className="leading-relaxed">{insight}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Data Points */}
            {currentImage.data_points && currentImage.data_points.length > 0 && (
              <div className="space-y-2 w-full">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide sticky top-0 bg-muted/30 py-1.5 -mx-2 px-2 rounded z-10 text-center">
                  Data Points
                </h4>
                <div className="flex flex-wrap gap-2 w-full justify-center">
                  {currentImage.data_points.map((point, idx) => (
                    <span key={idx} className="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-md">
                      {point}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Metadata - Fixed at bottom */}
          <div className="flex items-center flex-wrap gap-4 text-xs text-muted-foreground pt-3 mt-3 border-t flex-shrink-0 w-full">
            {currentImage.category && (
              <span className="capitalize">
                Category: <strong className="text-foreground">{currentImage.category}</strong>
              </span>
            )}
            {currentImage.page && (
              <span>
                Page: <strong className="text-foreground">{currentImage.page}</strong>
              </span>
            )}
            {currentImage.type && (
              <span>
                Type: <strong className="text-foreground">{currentImage.type}</strong>
              </span>
            )}
            <span className="ml-auto">
              <strong className="text-foreground">{currentIndex + 1}</strong> of <strong className="text-foreground">{images.length}</strong>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

