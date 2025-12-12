import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  CheckCircle,
  XCircle,
  RotateCcw,
  Upload,
  Loader2,
  AlertCircle,
  Video,
  Image as ImageIcon,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { gptStaticVideoService } from '@/services/gptStaticVideoService'
import { Sentence, SentenceVisual, SentenceAudio } from '@/services/geminiService'
import { ImageData } from '@/services/grobidApi'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface VisualGalleryProps {
  sentence: Sentence
  context?: string // Context from previous sentences or paper metadata
  onApprove: (sentenceId: string) => void
  onReject: (sentenceId: string) => void
  onVisualUpdate: (sentenceId: string, visual: SentenceVisual) => void
  onAudioUpdate?: (sentenceId: string, audio: SentenceAudio) => void // Optional: for auto-generating audio
  tables?: Array<{ title: string; data: string }> // Tables data for contextual image enhancement
  images?: ImageData[] // Images/figures data for contextual image enhancement
}

export function VisualGallery({
  sentence,
  context,
  onApprove,
  onReject,
  onVisualUpdate,
  onAudioUpdate,
  tables,
  images,
}: VisualGalleryProps) {
  // Initialize visual from sentence prop - sentence.visual is always the source of truth
  const [visual, setVisual] = useState<SentenceVisual | undefined>(() => {
    // Always use sentence.visual if it exists
    return sentence.visual
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isPolling] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'gpt' | 'veo3'>(
    sentence.visual?.mode || 'gpt' // Default to GPT static mode
  )
  const [videoZoom, setVideoZoom] = useState<number>(1.0) // Video zoom: 0.5 - 2.0
  const [subtitleYPosition, setSubtitleYPosition] = useState<number>(
    sentence.visual?.subtitleSettings?.yPosition || 940 // Default bottom position (ensures subtitles stay at bottom)
  )
  const [subtitleFontSize] = useState<number>(
    sentence.visual?.subtitleSettings?.fontSize || 42
  )
  const [subtitleZoom, setSubtitleZoom] = useState<number>(
    sentence.visual?.subtitleSettings?.zoom || 1.0
  )
  const [transitionType, setTransitionType] = useState<'fade' | 'slide' | 'dissolve' | 'none'>(
    sentence.visual?.transitionType || 'fade'
  )
  // Editable subtitle text (synchronized with video/audio generation)
  const [subtitleText, setSubtitleText] = useState<string>(() => {
    if (sentence.visual?.subtitleText) {
      return sentence.visual.subtitleText
    }
    return sentence.text || ''
  })
  // Editable image/video generation prompt
  const [prompt, setPrompt] = useState<string>(() => {
    return sentence.visual?.prompt || ''
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Track the last sentence ID to detect sentence changes
  const lastSentenceIdRef = useRef<string | undefined>(sentence.id)
  
  // Sync visual from sentence prop - sentence.visual is the source of truth
  // Only sync when sentence ID changes (new sentence loaded), not when user edits
  useEffect(() => {
    // Check if this is a different sentence
    const isNewSentence = lastSentenceIdRef.current !== sentence.id
    if (isNewSentence) {
      lastSentenceIdRef.current = sentence.id
      
      // Reset subtitle text tracking for new sentence
      if (sentence.visual?.subtitleText) {
        lastSavedSubtitleText.current = sentence.visual.subtitleText
        setSubtitleText(sentence.visual.subtitleText)
      } else {
        lastSavedSubtitleText.current = sentence.text || ''
        setSubtitleText(sentence.text || '')
      }
    }
    
    // Only sync if this is a different sentence
    if (sentence.visual) {
      // Always sync prompt from sentence.visual.prompt
      const currentPrompt = sentence.visual?.prompt || ''
      if (currentPrompt && currentPrompt !== prompt) {
        setPrompt(currentPrompt)
      }
      
      // Sync subtitle text from visual only on new sentence load
      if (isNewSentence) {
        if (sentence.visual?.subtitleText) {
          setSubtitleText(sentence.visual.subtitleText)
          lastSavedSubtitleText.current = sentence.visual.subtitleText
        } else {
          setSubtitleText(sentence.text || '')
          lastSavedSubtitleText.current = sentence.text || ''
        }
      }
      
      // Sync visual state
      if (sentence.visual !== visual) {
        setVisual(sentence.visual)
      }
    }
  }, [sentence.id, sentence.visual, sentence.text]) // Sync when sentence ID or visual changes

  // Check if subtitle settings have changed from the saved video
  const subtitleSettingsChanged = visual && visual.status === 'completed' && (
    visual.subtitleSettings?.yPosition !== subtitleYPosition ||
    visual.subtitleSettings?.fontSize !== subtitleFontSize ||
    visual.subtitleSettings?.zoom !== subtitleZoom ||
    visual.subtitleText !== (subtitleText || sentence.text)
  )

  // Auto-save subtitle settings when they change (if video already exists)
  // Use a ref to prevent overwriting user edits
  const lastSavedSubtitleText = useRef<string>(
    sentence.visual?.subtitleText || sentence.text || ''
  )
  
  useEffect(() => {
    if (visual && visual.status === 'completed' && !visual.approved) {
      // Check if subtitle settings have changed
      const settingsChanged = 
        visual.subtitleSettings?.yPosition !== subtitleYPosition ||
        visual.subtitleSettings?.fontSize !== subtitleFontSize ||
        visual.subtitleSettings?.zoom !== subtitleZoom ||
        visual.subtitleText !== subtitleText

      if (settingsChanged) {
        // Auto-save updated subtitle settings to visual state
        const updatedVisual: SentenceVisual = {
          ...visual,
          subtitleSettings: {
            yPosition: subtitleYPosition,
            fontSize: subtitleFontSize,
            zoom: subtitleZoom,
          },
          subtitleText: subtitleText || sentence.text,
        }
        setVisual(updatedVisual)
        onVisualUpdate(sentence.id, updatedVisual)
        lastSavedSubtitleText.current = subtitleText || sentence.text
      }
    }
  }, [subtitleYPosition, subtitleFontSize, subtitleZoom, subtitleText, visual, sentence.id, sentence.text, onVisualUpdate])

  const handleGenerate = async () => {
    if (isGenerating) return

    setIsGenerating(true)
    setProgress(0)

    try {
      if (selectedMode === 'gpt') {
        // Transform images to match backend schema (only title and description)
        const transformedImages = images?.map(img => ({
          title: img.title || img.caption || '',
          description: img.description || '',
        })) || undefined

        // GPT Static mode
        // Log subtitle settings being sent
        console.log('🎬 Generating video with subtitle settings:', {
          yPosition: subtitleYPosition,
          fontSize: subtitleFontSize,
          zoom: subtitleZoom,
          subtitleText: subtitleText || sentence.text,
          subtitleTextLength: (subtitleText || sentence.text).length,
        })

        const result = await gptStaticVideoService.generateStaticVideo(
          sentence.text,
          6, // duration
          typeof context === 'string' ? { fullScript: context } : context,
          'none', // zoomEffect
          transitionType,
          {
            yPosition: subtitleYPosition,
            fontSize: subtitleFontSize,
            zoom: subtitleZoom,
          },
          subtitleText || sentence.text,
          prompt || undefined,
          tables,
          transformedImages
        )

      const completedVisual: SentenceVisual = {
          ...result,
        status: 'completed',
          approved: false,
        mode: 'gpt',
        transitionType: transitionType,
        subtitleSettings: {
          yPosition: subtitleYPosition,
          fontSize: subtitleFontSize,
          zoom: subtitleZoom,
        },
          prompt: result.prompt || prompt || undefined,
          subtitleText: subtitleText || sentence.text,
      }

      setVisual(completedVisual)
      onVisualUpdate(sentence.id, completedVisual)
        setPrompt(result.prompt || prompt || '')
        toast.success('✅ Static video generated! Review and click Approve.')
      } else {
        // VEO 3 mode
        toast.info('VEO 3 generation not implemented yet')
      }
    } catch (error: any) {
      console.error('Video generation failed:', error)
      toast.error(error.message || 'Failed to generate video')
      if (visual) {
        const failedVisual: SentenceVisual = {
          ...visual,
          status: 'failed',
        }
        setVisual(failedVisual)
        onVisualUpdate(sentence.id, failedVisual)
      }
    } finally {
      setIsGenerating(false)
      setProgress(0)
    }
  }

  const handleRegenerate = async () => {
    toast.info('Regenerating video...')
    await handleGenerate()
  }

  const handlePreviewPrompt = async () => {
    if (isGeneratingPrompt) return

    // Validate sentence is not empty
    if (!sentence.text || sentence.text.trim().length === 0) {
      toast.error('Sentence text is required to generate a prompt')
      return
    }

    setIsGeneratingPrompt(true)
    try {
      // Transform images to match backend schema (only title and description)
      // Filter out images with empty title and description
      const transformedImages = images?.map(img => ({
        title: (img.title || img.caption || '').trim(),
        description: (img.description || '').trim(),
      })).filter(img => img.title.length > 0 || img.description.length > 0) || undefined

      // Transform tables to ensure they have valid title and data
      const transformedTables = tables?.map(table => ({
        title: (table.title || '').trim(),
        data: (table.data || '').trim(),
      })).filter(table => table.title.length > 0 || table.data.length > 0) || undefined

      const generatedPrompt = await gptStaticVideoService.generatePrompt({
        sentenceText: sentence.text.trim(),
        context: typeof context === 'string' ? { fullScript: context.trim() } : context,
        customPrompt: prompt?.trim() || undefined,
        tables: transformedTables,
        images: transformedImages,
      })

      setPrompt(generatedPrompt)
      toast.success('✅ Prompt generated! Review it above, then click "Generate Static" to create the video.')
    } catch (error: any) {
      console.error('Prompt preview failed:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Failed to generate prompt preview'
      toast.error(errorMessage)
    } finally {
      setIsGeneratingPrompt(false)
    }
  }


  const handleUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file')
      return
    }

    try {
      setIsGenerating(true)
      const videoUrl = URL.createObjectURL(file)

      const uploadedVisual: SentenceVisual = {
        videoId: `uploaded-${Date.now()}`,
        status: 'completed',
        videoUrl: videoUrl,
        thumbnailUrl: videoUrl,
        approved: false,
        uploaded: true,
        mode: 'gpt',
        transitionType: transitionType,
        subtitleSettings: {
          yPosition: subtitleYPosition,
          fontSize: subtitleFontSize,
          zoom: subtitleZoom,
        },
        prompt: prompt || undefined,
        subtitleText: subtitleText || sentence.text,
      }

      setVisual(uploadedVisual)
      onVisualUpdate(sentence.id, uploadedVisual)
      toast.success('Video uploaded successfully!')
    } catch (error) {
      console.error('Upload failed:', error)
      toast.error('Failed to upload video')
    } finally {
      setIsGenerating(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleApprove = async () => {
    if (!visual) return

    // CRITICAL: Ensure we preserve ALL properties including videoUrl and imageUrl
    const approvedVisual: SentenceVisual = {
      ...visual,
      status: 'approved',
      approved: true,
      mode: visual.mode, // Preserve mode
      transitionType: visual.transitionType || transitionType, // Preserve transition
      // CRITICAL: Always save subtitle settings (for all modes with subtitles)
        subtitleSettings: {
          yPosition: subtitleYPosition,
          fontSize: subtitleFontSize,
          zoom: subtitleZoom,
        },
      // Preserve editable subtitle text and prompt
      subtitleText: subtitleText || visual.subtitleText || sentence.text,
      prompt: prompt || visual.prompt,
    }

    setVisual(approvedVisual)
    onVisualUpdate(sentence.id, approvedVisual)
    
    onApprove(sentence.id)
    
    // AUTO-GENERATE AUDIO when video is approved
    const audioText = subtitleText || sentence.text
    if (onAudioUpdate && audioText && !sentence.audio?.audioUrl && !sentence.audio?.audioBase64) {
      console.log('🎵 Auto-generating audio for approved video...', sentence.id)
      toast.info('🎵 Auto-generating audio narration for this video...')
      
      try {
        const { elevenLabsService } = await import('@/services/elevenLabsService')
        const result = await elevenLabsService.generateAudio({
          text: audioText,
          sentenceId: sentence.id,
          voiceId: '21m00Tcm4TlvDq8ikWAM',
        })

        const autoGeneratedAudio: SentenceAudio = {
          ...result,
          approved: true,
          status: 'approved',
          isCustom: false,
        }

        onAudioUpdate(sentence.id, autoGeneratedAudio)
        toast.success('✅ Audio auto-generated and auto-approved! Ready for assembly.')
      } catch (error) {
        console.error('❌ Auto-audio generation failed:', error)
        toast.error('Failed to auto-generate audio. You can generate it manually.')
      }
    }
    
    toast.success(visual.mode === 'gpt' 
      ? `✅ Video approved and exported to Video Assembly! Subtitle settings saved (Position: ${Math.round(subtitleYPosition)}px, Size: ${Math.round(subtitleZoom * 100)}%)` 
      : '✅ Video approved and exported to Video Assembly!')
  }

  const handleReject = () => {
    if (!visual) return

    const rejectedVisual: SentenceVisual = {
      ...visual,
      status: 'rejected',
      approved: false,
    }

    setVisual(rejectedVisual)
    onVisualUpdate(sentence.id, rejectedVisual)
    onReject(sentence.id)
    toast.info('Video rejected')
  }

  const getStatusBadge = () => {
    if (!visual) return null

    const statusConfig = {
      pending: { label: 'Pending', variant: 'secondary' as const, icon: Video },
      generating: { label: 'Generating', variant: 'secondary' as const, icon: Loader2 },
      completed: { label: 'Ready', variant: 'default' as const, icon: CheckCircle },
      failed: { label: 'Failed', variant: 'destructive' as const, icon: AlertCircle },
      approved: { label: 'Approved', variant: 'default' as const, icon: CheckCircle },
      rejected: { label: 'Rejected', variant: 'secondary' as const, icon: XCircle },
    }

    const config = statusConfig[visual.status] || statusConfig.pending
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg">Visual for Sentence {sentence.id?.replace('sentence_', '') || sentence.id || 'N/A'}</CardTitle>
            <CardDescription className="text-xs line-clamp-2">{sentence.text}</CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            {visual?.mode && (
              <Badge variant="secondary" className="text-xs">
                {visual.mode === 'gpt' ? '🎨 GPT Static' : '🎬 VEO 3'}
              </Badge>
            )}
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PROMPT FIELD - ALWAYS VISIBLE */}
        <div className="mb-6 space-y-4">
          <div className="rounded-lg border-2 border-border bg-card shadow-sm overflow-hidden">
            {/* Header Section */}
            <div className="px-4 py-3 bg-muted/50 border-b border-border">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-md bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="generation-prompt" className="text-sm font-semibold text-foreground cursor-pointer">
                      Image/Video Generation Prompt
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Customize the prompt that will be used to generate your visual
                    </p>
                  </div>
                </div>
                {visual?.prompt && (
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Generated
                  </Badge>
                )}
              </div>
            </div>

            {/* Textarea Section */}
            <div className="p-4">
              <Textarea
                id="generation-prompt"
                value={prompt || sentence.visual?.prompt || visual?.prompt || ''}
                onChange={(e) => {
                  const newPrompt = e.target.value
                  setPrompt(newPrompt)
                  if (visual) {
                    const updatedVisual: SentenceVisual = {
                      ...visual,
                      prompt: newPrompt,
                    }
                    setVisual(updatedVisual)
                    onVisualUpdate(sentence.id, updatedVisual)
                  } else {
                    const newVisual: SentenceVisual = {
                      status: 'pending',
                      approved: false,
                      prompt: newPrompt,
                    }
                    setVisual(newVisual)
                    onVisualUpdate(sentence.id, newVisual)
                  }
                }}
                placeholder="Enter your custom prompt for image/video generation, or leave empty to auto-generate based on sentence and context..."
                className="min-h-[140px] text-sm font-mono resize-y bg-background border-border focus:ring-2 focus:ring-primary/20 transition-all"
                disabled={isGenerating}
              />
            </div>

            {/* Action Section */}
            <div className="px-4 py-3 bg-muted/30 border-t border-border">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handlePreviewPrompt}
                      disabled={isGeneratingPrompt || isGenerating}
                      variant="default"
                      size="sm"
                      className="shadow-sm"
                    >
                      {isGeneratingPrompt ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                          Generating Prompt...
                        </>
                      ) : (
                        <>
                          <FileText className="h-3.5 w-3.5 mr-2" />
                          Preview Prompt
                        </>
                      )}
                    </Button>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <span className="font-medium text-foreground">Step 1:</span> Click "Preview Prompt" to auto-generate a prompt, or write your own above. 
                        <span className="font-medium text-foreground ml-1">Step 2:</span> Click "Generate Static" below to create the video.
                      </p>
                    </div>
                  </div>
                  
                  {/* Status Messages */}
                  <div className="space-y-1">
                    {visual?.prompt && prompt && prompt === visual.prompt && (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        <span>This prompt was used in the previous generation. Edit it above to change the visual.</span>
                      </div>
                    )}
                    {!visual?.prompt && !prompt && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span>No prompt set. Click "Preview Prompt" to generate one, or enter your own custom prompt.</span>
                      </div>
                    )}
                    {prompt && prompt !== visual?.prompt && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3" />
                        <span>Prompt has been edited. This will be used for the next generation.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Video Preview */}
        <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden">
          {visual?.videoUrl ? (
            <div className="w-full h-full relative overflow-hidden">
              <video
                src={visual.videoUrl}
                controls
                loop={visual.mode === 'gpt'}
                autoPlay={visual.mode === 'gpt'}
                muted={visual.mode === 'gpt'}
                className="w-full h-full object-cover transition-transform duration-300"
                style={{
                  transform: `scale(${videoZoom})`,
                  transformOrigin: 'center center',
                }}
              />
              {visual.mode === 'gpt' && (
                <div className="absolute top-2 left-2 z-10 pointer-events-none">
                  <Badge variant="secondary" className="text-xs bg-black/70 text-white border border-white/20">
                    🎨 GPT Static • Video: {(videoZoom * 100).toFixed(0)}% • Sub: {(subtitleZoom * 100).toFixed(0)}%
                  </Badge>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <div className="text-center space-y-2">
                <Video className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No video generated yet</p>
              </div>
            </div>
          )}

          {/* Progress Overlay */}
          {(isGenerating || isPolling) && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30">
              <div className="text-center space-y-2 w-full px-4">
                <Loader2 className="h-8 w-8 mx-auto text-white animate-spin" />
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-white">{progress}%</p>
              </div>
            </div>
          )}
        </div>

        {/* Mode Selection Toggle */}
        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block">Generation Mode:</label>
          <div className="flex gap-2">
            <Button
              variant={selectedMode === 'gpt' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedMode('gpt')}
              disabled={isGenerating || visual?.status === 'completed'}
              className="flex-1"
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              GPT Static
            </Button>
            <Button
              variant={selectedMode === 'veo3' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedMode('veo3')}
              disabled={isGenerating || visual?.status === 'completed'}
              className="flex-1"
            >
              <Video className="h-4 w-4 mr-2" />
              VEO 3 Cinematic
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {selectedMode === 'gpt' 
              ? '🎨 Static: Academic visuals with DALL-E 3 (faster, cheaper)' 
              : '🎬 Cinematic: AI-generated video clips (slower, premium)'}
          </p>
        </div>

        {/* Transition Selection */}
        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block">Transition to Next Scene:</label>
          <p className="text-xs text-muted-foreground mb-2">Transitions will be applied during final video export</p>
          <div className="flex gap-2">
            {(['fade', 'slide', 'dissolve', 'none'] as const).map((transition) => (
              <Button
                key={transition}
                variant={transitionType === transition ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTransitionType(transition)}
                className="flex-1 capitalize"
              >
                {transition}
              </Button>
            ))}
          </div>
        </div>

        {/* Live Controls (only show after GPT video is generated) */}
        {visual?.status === 'completed' && visual?.mode === 'gpt' && (
          <div className="mb-6 space-y-4">
            <div className="rounded-lg border-2 border-border bg-card shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 bg-muted/50 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <Video className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">Live Video & Subtitle Controls</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Adjust video zoom, subtitle size, and position in real-time
                      </p>
                    </div>
                  </div>
                  {subtitleSettingsChanged && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded">
                      <AlertCircle className="h-3 w-3" />
                      <span>Settings changed - Click "Regenerate" to apply</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls Content */}
              <div className="p-4 space-y-5">
                {/* Video Zoom Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span>🎬</span>
                      <span>Video Zoom</span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{Math.round(videoZoom * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVideoZoom(Math.max(0.5, videoZoom - 0.1))}
                      disabled={videoZoom <= 0.5}
                      className="h-8 w-8 p-0"
                    >
                      -
                    </Button>
                    <div className="flex-1">
                      <input
                        type="range"
                        min="50"
                        max="200"
                        step="5"
                        value={videoZoom * 100}
                        onChange={(e) => setVideoZoom(parseInt(e.target.value) / 100)}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVideoZoom(Math.min(2.0, videoZoom + 0.1))}
                      disabled={videoZoom >= 2.0}
                      className="h-8 w-8 p-0"
                    >
                      +
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setVideoZoom(1.0)}
                      className="h-8 px-3"
                    >
                      Reset
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border"></div>

                {/* Subtitle Size Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span>📝</span>
                      <span>Subtitle Size</span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{Math.round(subtitleZoom * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubtitleZoom(Math.max(0.5, subtitleZoom - 0.1))}
                      disabled={subtitleZoom <= 0.5}
                      className="h-8 w-8 p-0"
                    >
                      -
                    </Button>
                    <div className="flex-1">
                      <input
                        type="range"
                        min="50"
                        max="200"
                        step="5"
                        value={subtitleZoom * 100}
                        onChange={(e) => setSubtitleZoom(parseInt(e.target.value) / 100)}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubtitleZoom(Math.min(2.0, subtitleZoom + 0.1))}
                      disabled={subtitleZoom >= 2.0}
                      className="h-8 w-8 p-0"
                    >
                      +
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSubtitleZoom(1.0)}
                      className="h-8 px-3"
                    >
                      Reset
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border"></div>

                {/* Subtitle Text Control */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span>✏️</span>
                    <span>Subtitle Text</span>
                  </label>
                  <Textarea
                    value={subtitleText || sentence.text || ''}
                    onChange={(e) => {
                      const newSubtitleText = e.target.value
                      setSubtitleText(newSubtitleText)
                      // Auto-save to visual if it exists
                      if (visual) {
                        const updatedVisual: SentenceVisual = {
                          ...visual,
                          subtitleText: newSubtitleText,
                        }
                        setVisual(updatedVisual)
                        onVisualUpdate(sentence.id, updatedVisual)
                      }
                    }}
                    placeholder="Enter subtitle text..."
                    className="min-h-[60px] text-sm resize-y bg-background border-border"
                    disabled={isGenerating}
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-border"></div>

                {/* Subtitle Position Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span>📍</span>
                      <span>Subtitle Position</span>
                    </label>
                    <span className="text-sm font-semibold text-primary">
                      {subtitleYPosition <= 250 ? 'Top' : subtitleYPosition < 750 ? 'Center' : 'Bottom'} ({Math.round(subtitleYPosition)}px)
                    </span>
                  </div>
                  
                  {/* Quick Position Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant={subtitleYPosition <= 250 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSubtitleYPosition(200)}
                      className="flex-1"
                    >
                      Top
                    </Button>
                    <Button
                      variant={subtitleYPosition >= 250 && subtitleYPosition < 750 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSubtitleYPosition(540)}
                      className="flex-1"
                    >
                      Center
                    </Button>
                    <Button
                      variant={subtitleYPosition >= 750 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSubtitleYPosition(880)}
                      className="flex-1"
                    >
                      Bottom
                    </Button>
                  </div>

                  {/* Fine-tune Slider */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubtitleYPosition(Math.max(100, subtitleYPosition - 50))}
                      disabled={subtitleYPosition <= 100}
                      className="h-8 w-8 p-0"
                    >
                      -
                    </Button>
                    <div className="flex-1">
                      <input
                        type="range"
                        min="100"
                        max="980"
                        step="10"
                        value={subtitleYPosition}
                        onChange={(e) => setSubtitleYPosition(parseInt(e.target.value))}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubtitleYPosition(Math.min(980, subtitleYPosition + 50))}
                      disabled={subtitleYPosition >= 980}
                      className="h-8 w-8 p-0"
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {(!visual || visual?.status === 'pending' || visual?.status === 'failed') && !visual?.approved ? (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex-1 min-w-[100px]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Generate Static
                </>
              )}
            </Button>
          ) : null}
          
          {visual?.status === 'completed' && !visual.approved && (
            <>
              <Button
                onClick={handleApprove}
                variant="default"
                className="flex-1 min-w-[100px]"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                onClick={handleReject}
                variant="outline"
                className="flex-1 min-w-[100px]"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={handleRegenerate}
                variant="outline"
                className="flex-1 min-w-[100px]"
                disabled={isGenerating}
              >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Regenerate
              </Button>
            </>
          )}

          <Button
            onClick={handleUpload}
            variant="outline"
            className="flex-1 min-w-[100px]"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Status Messages */}
        {visual?.uploaded && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>Custom video uploaded</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
