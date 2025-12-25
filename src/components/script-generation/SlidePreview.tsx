import { Card, CardContent } from '@/components/ui/card'
import { Sentence } from '@/services/geminiService'

interface SlidePreviewProps {
  sentence: Sentence
  backgroundImageUrl?: string // URL of the background image (from visual.imageUrl)
}

export function SlidePreview({ sentence, backgroundImageUrl }: SlidePreviewProps) {
  // Default background if no image provided
  const defaultBackground = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  const backgroundStyle = backgroundImageUrl
    ? {
        backgroundImage: `url(${backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(10px)', // Apply blur to background
      }
    : {
        background: defaultBackground,
      }

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        {/* Slide Preview Container */}
        <div
          className="relative w-full aspect-video rounded-lg overflow-hidden"
          style={backgroundStyle}
        >
          {/* Overlay for text readability */}
          <div className="absolute inset-0 bg-black/40" />
          
          {/* Background Image Layer (blurred) */}
          {backgroundImageUrl && (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${backgroundImageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(15px)',
                transform: 'scale(1.1)', // Slight scale to prevent blur edges
              }}
            />
          )}
          
          {/* Content Overlay */}
          <div className="absolute inset-0 flex items-center justify-center p-8">
            {/* Presentation Text (Bullet Points) */}
            {sentence.presentation_text && sentence.presentation_text.length > 0 ? (
              <div className="w-full max-w-4xl">
                <ul className="space-y-4">
                  {sentence.presentation_text.map((point, index) => (
                    <li
                      key={index}
                      className="text-white text-xl md:text-2xl lg:text-3xl font-semibold text-center"
                      style={{
                        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
                      }}
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-white text-xl md:text-2xl font-semibold text-center opacity-70">
                Generated PPT Bullet Points
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
