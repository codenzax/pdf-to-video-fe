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
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { gptStaticVideoService } from '@/services/gptStaticVideoService'
import { Sentence, SentenceVisual, SentenceAudio, geminiService } from '@/services/geminiService'
import { ImageData } from '@/services/grobidApi'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { UnsplashImageSearch } from './UnsplashImageSearch'
import { UnsplashImageData } from '@/services/unsplashService'

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
  const [selectedMode, setSelectedMode] = useState<'gpt' | 'unsplash'>(
    sentence.visual?.mode || 'gpt' // Default to GPT static mode
  )
  const [imageSource, setImageSource] = useState<'ai' | 'unsplash'>(
    sentence.visual?.imageSource || 'ai' // Default to AI generation
  )
  const [showUnsplashSearch, setShowUnsplashSearch] = useState(false)
  const [selectedUnsplashImage, setSelectedUnsplashImage] = useState<UnsplashImageData | null>(
    sentence.visual?.unsplashImageData ? {
      id: sentence.visual.unsplashImageData.id,
      url: sentence.visual.unsplashImageData.url,
      photographer: sentence.visual.unsplashImageData.photographer,
      photographerUsername: sentence.visual.unsplashImageData.photographerUsername,
      photographerUrl: sentence.visual.unsplashImageData.photographerUrl,
      unsplashUrl: sentence.visual.unsplashImageData.unsplashUrl,
      description: sentence.visual.unsplashImageData.description,
      width: 0,
      height: 0,
    } : null
  )
  const [videoZoom, setVideoZoom] = useState<number>(1.0) // Video zoom: 0.5 - 2.0
  const [subtitleYPosition, setSubtitleYPosition] = useState<number>(
    sentence.visual?.subtitleSettings?.yPosition || 950 // Default: positioned in white border area at bottom (30px from bottom)
  )
  const [subtitleFontSize, setSubtitleFontSize] = useState<number>(
    sentence.visual?.subtitleSettings?.fontSize || 42
  )
  const [subtitleZoom, setSubtitleZoom] = useState<number>(
    sentence.visual?.subtitleSettings?.zoom || 1.0
  )
  const [transitionType] = useState<'fade' | 'slide' | 'dissolve' | 'none'>(
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
  // Editable presentation text (bullet points) - shown before video generation
  const [presentationText, setPresentationText] = useState<string[]>(() => {
    // First check if sentence has presentation_text from script generation
    if (sentence.presentation_text && sentence.presentation_text.length > 0) {
      return sentence.presentation_text
    }
    // Then check if visual has saved presentationText
    if (sentence.visual?.presentationText && sentence.visual.presentationText.length > 0) {
      return sentence.visual.presentationText
    }
    return []
  })
  const [isGeneratingBulletPoints, setIsGeneratingBulletPoints] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Generate bullet points using Gemini (manual trigger only)
  const generateBulletPointsForSentence = async () => {
    if (isGeneratingBulletPoints || !sentence.text || sentence.text.trim().length === 0) {
      return
    }

    setIsGeneratingBulletPoints(true)
    try {
      const bulletPoints = await geminiService.generateBulletPoints(
        sentence.text,
        typeof context === 'string' ? { fullScript: context } : context
      )
      
      if (bulletPoints.length > 0) {
        setPresentationText(bulletPoints)
        // Auto-save to visual if it exists
        if (visual) {
          const updatedVisual: SentenceVisual = {
            ...visual,
            presentationText: bulletPoints,
          }
          setVisual(updatedVisual)
          onVisualUpdate(sentence.id, updatedVisual)
        }
        toast.success('✅ Bullet points generated! They will be baked into the video.')
      }
    } catch (error: any) {
      console.error('Failed to generate bullet points:', error)
      toast.error('Failed to generate bullet points: ' + (error.message || 'Unknown error'))
    } finally {
      setIsGeneratingBulletPoints(false)
    }
  }

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
        setSubtitleText(sentence.visual.subtitleText)
      } else {
        setSubtitleText(sentence.text || '')
      }
      
      // Update last saved settings ref for new sentence
      if (sentence.visual?.subtitleSettings) {
        lastSavedSettingsRef.current = {
          yPosition: sentence.visual.subtitleSettings.yPosition,
          fontSize: sentence.visual.subtitleSettings.fontSize,
          zoom: sentence.visual.subtitleSettings.zoom,
          subtitleText: sentence.visual.subtitleText || sentence.text || '',
        }
      } else {
        lastSavedSettingsRef.current = {
          subtitleText: sentence.visual?.subtitleText || sentence.text || '',
        }
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
        } else {
          setSubtitleText(sentence.text || '')
        }
        // Sync presentation text from visual or sentence
        if (sentence.presentation_text && sentence.presentation_text.length > 0) {
          setPresentationText(sentence.presentation_text)
        } else if (sentence.visual?.presentationText && sentence.visual.presentationText.length > 0) {
          setPresentationText(sentence.visual.presentationText)
        } else {
          // Don't auto-generate - user must click button
          setPresentationText([])
        }
      }
      
      // Sync visual state only on new sentence OR if visual is null/undefined (prevent loops)
      if (isNewSentence || !visual) {
        setVisual(sentence.visual)
      }
      
      // Only sync subtitle settings from visual on NEW sentence load (prevent infinite loops)
      if (isNewSentence && sentence.visual?.subtitleSettings) {
        const settings = sentence.visual.subtitleSettings
        // Sync all settings once on initial load
        if (settings.yPosition !== undefined) {
          setSubtitleYPosition(settings.yPosition)
        }
        if (settings.fontSize !== undefined) {
          setSubtitleFontSize(settings.fontSize)
        }
        if (settings.zoom !== undefined) {
          setSubtitleZoom(settings.zoom)
        }
      }
    }
  }, [sentence.id, sentence.text]) // Only depend on sentence.id and sentence.text - NOT sentence.visual to prevent loops

  // Check if subtitle settings have changed from the saved video
  const subtitleSettingsChanged = visual && visual.status === 'completed' && (
    visual.subtitleSettings?.yPosition !== subtitleYPosition ||
    visual.subtitleSettings?.fontSize !== subtitleFontSize ||
    visual.subtitleSettings?.zoom !== subtitleZoom ||
    visual.subtitleText !== (subtitleText || sentence.text)
  )

  // Track last saved subtitle settings to prevent unnecessary updates
  const lastSavedSettingsRef = useRef<{
    yPosition?: number
    fontSize?: number
    zoom?: number
    subtitleText?: string
  }>({
    yPosition: sentence.visual?.subtitleSettings?.yPosition,
    fontSize: sentence.visual?.subtitleSettings?.fontSize,
    zoom: sentence.visual?.subtitleSettings?.zoom,
    subtitleText: sentence.visual?.subtitleText || sentence.text || '',
  })
  
  // Auto-save subtitle settings when they change (if video already exists)
  // Use debounce and refs to prevent unnecessary saves and infinite loops
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  useEffect(() => {
    // Only auto-save if video exists, is completed, and not approved
    if (visual && visual.status === 'completed' && !visual.approved) {
      // Check if subtitle settings have actually changed from last saved state
      const settingsChanged = 
        lastSavedSettingsRef.current.yPosition !== subtitleYPosition ||
        lastSavedSettingsRef.current.fontSize !== subtitleFontSize ||
        lastSavedSettingsRef.current.zoom !== subtitleZoom ||
        lastSavedSettingsRef.current.subtitleText !== subtitleText

      // Only update if settings actually changed
      if (settingsChanged) {
        // Clear existing timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
        
        // Debounce updates to prevent rapid-fire saves
        saveTimeoutRef.current = setTimeout(() => {
          // Only update if still different (user might have changed again)
          const stillChanged = 
            lastSavedSettingsRef.current.yPosition !== subtitleYPosition ||
            lastSavedSettingsRef.current.fontSize !== subtitleFontSize ||
            lastSavedSettingsRef.current.zoom !== subtitleZoom ||
            lastSavedSettingsRef.current.subtitleText !== subtitleText

          if (stillChanged) {
            // Update local visual state (don't trigger session save - only save on approve)
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
            
            // Update refs to track what we've saved
            lastSavedSettingsRef.current = {
              yPosition: subtitleYPosition,
              fontSize: subtitleFontSize,
              zoom: subtitleZoom,
              subtitleText: subtitleText || sentence.text,
            }
            
            // NOTE: We DON'T call onVisualUpdate here to prevent session spam
            // Settings will be saved when user clicks Approve
            saveTimeoutRef.current = null
          }
        }, 500) // 500ms debounce - only update local state, don't save to session
      }
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [subtitleYPosition, subtitleFontSize, subtitleZoom, subtitleText, visual])

  const handleGenerateGPT = async () => {
    // FIXED GPT/DALL-E GENERATION - ALWAYS uses DALL-E
    if (isGenerating) return

    setIsGenerating(true)
    setProgress(0)

    try {
      // ALWAYS use GPT/DALL-E generation
      // ALWAYS use DALL-E/AI generation (never Unsplash)
      const transformedImages = images?.map(img => ({
        title: img.title || img.caption || '',
        description: img.description || '',
      })) || undefined

      console.log('?? FIXED GPT BUTTON: Generating with DALL-E (GPT Static):', {
        imageSource: 'ai',
        willUseDALL_E: true,
        willUseUnsplash: false,
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
        transformedImages,
        'ai', // FIXED: ALWAYS 'ai' for GPT button
        undefined, // FIXED: ALWAYS undefined - no Unsplash URL
        presentationText.length > 0 ? presentationText : undefined // Pass presentation text
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
        presentationText: presentationText.length > 0 ? presentationText : undefined,
        imageSource: 'ai',
      }

      setVisual(completedVisual)
      onVisualUpdate(sentence.id, completedVisual)
      setPrompt(result.prompt || prompt || '')
      toast.success('? GPT Static video generated with DALL-E! Review and click Approve.')
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

  const handleGenerateUnsplash = async () => {
    // FIXED UNSPLASH GENERATION - ALWAYS uses Unsplash image
    if (isGenerating) return

    // Validate Unsplash image is selected
    if (!selectedUnsplashImage || !selectedUnsplashImage.url) {
      toast.error('Please select an image from Unsplash first')
      setShowUnsplashSearch(true)
      return
    }

    setIsGenerating(true)
    setProgress(0)

    try {
      // ALWAYS use Unsplash image (NEVER DALL-E)
      const transformedImages = images?.map(img => ({
        title: img.title || img.caption || '',
        description: img.description || '',
      })) || undefined

      console.log('?? FIXED UNSPLASH BUTTON: Generating with Unsplash image:', {
        imageSource: 'unsplash',
        willUseDALL_E: false,
        willUseUnsplash: true,
        unsplashImageUrl: selectedUnsplashImage.url,
        unsplashImageId: selectedUnsplashImage.id,
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
        undefined, // NO custom prompt for Unsplash
        tables,
        transformedImages,
        'unsplash', // FIXED: ALWAYS 'unsplash' for Unsplash button
        selectedUnsplashImage.url, // FIXED: REQUIRED Unsplash URL
        presentationText.length > 0 ? presentationText : undefined // Pass presentation text
      )

      const completedVisual: SentenceVisual = {
        ...result,
        status: 'completed',
        approved: false,
        mode: 'unsplash',
        transitionType: transitionType,
        subtitleSettings: {
          yPosition: subtitleYPosition,
          fontSize: subtitleFontSize,
          zoom: subtitleZoom,
        },
        prompt: result.prompt || prompt || undefined,
        subtitleText: subtitleText || sentence.text,
        presentationText: presentationText.length > 0 ? presentationText : undefined,
        imageSource: 'unsplash',
        unsplashImageData: selectedUnsplashImage ? {
          id: selectedUnsplashImage.id,
          url: selectedUnsplashImage.url,
          photographer: selectedUnsplashImage.photographer,
          photographerUsername: selectedUnsplashImage.photographerUsername,
          photographerUrl: selectedUnsplashImage.photographerUrl,
          unsplashUrl: selectedUnsplashImage.unsplashUrl,
          description: selectedUnsplashImage.description,
        } : undefined,
      }

      setVisual(completedVisual)
      onVisualUpdate(sentence.id, completedVisual)
      setPrompt(result.prompt || prompt || '')
      toast.success('? Unsplash video generated! Review and click Approve.')
    } catch (error: any) {
      console.error('Unsplash video generation failed:', error)
      toast.error(error.message || 'Failed to generate Unsplash video')
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
    // Regenerate using the same mode as the current visual
    if (visual?.mode === 'unsplash' && selectedUnsplashImage) {
      await handleGenerateUnsplash()
    } else {
      await handleGenerateGPT()
    }
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
      toast.success('? Prompt generated! Review it above, then click "Generate Static" to create the video.')
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
    // CRITICAL: Save current subtitle settings (from state, not visual) to ensure latest values are saved
    const approvedVisual: SentenceVisual = {
      ...visual,
      status: 'approved',
      approved: true,
      mode: visual.mode, // Preserve mode
      transitionType: visual.transitionType || transitionType, // Preserve transition
      // CRITICAL: Always save CURRENT subtitle settings (from state, not visual) - this ensures latest edits are saved
      subtitleSettings: {
        yPosition: subtitleYPosition,
        fontSize: subtitleFontSize,
        zoom: subtitleZoom,
      },
      // Preserve editable subtitle text and prompt
      subtitleText: subtitleText || visual.subtitleText || sentence.text,
      prompt: prompt || visual.prompt,
    }

    // Update refs to track what we've saved
    lastSavedSettingsRef.current = {
      yPosition: subtitleYPosition,
      fontSize: subtitleFontSize,
      zoom: subtitleZoom,
      subtitleText: subtitleText || visual.subtitleText || sentence.text,
    }

    setVisual(approvedVisual)
    // CRITICAL: Save to parent/session when approving (this is the only save point for subtitle settings)
    onVisualUpdate(sentence.id, approvedVisual)
    
    onApprove(sentence.id)
    
    // AUTO-GENERATE AUDIO when video is approved
    const audioText = subtitleText || sentence.text
    if (onAudioUpdate && audioText && !sentence.audio?.audioUrl && !sentence.audio?.audioBase64) {
      console.log('?? Auto-generating audio for approved video...', sentence.id)
      toast.info('?? Auto-generating audio narration for this video...')
      
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
        toast.success('? Audio auto-generated and auto-approved! Ready for assembly.')
      } catch (error) {
        console.error('? Auto-audio generation failed:', error)
        toast.error('Failed to auto-generate audio. You can generate it manually.')
      }
    }
    
    toast.success(visual.mode === 'gpt' 
      ? `? Video approved and exported to Video Assembly! Subtitle settings saved (Position: ${Math.round(subtitleYPosition)}px, Size: ${Math.round(subtitleZoom * 100)}%)` 
      : '? Video approved and exported to Video Assembly!')
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
                {visual.mode === 'gpt' ? '?? GPT Static' : '?? Unsplash AI'}
              </Badge>
            )}
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PROMPT FIELD (only for AI generation mode) */}
        {imageSource === 'ai' && (
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
        )}

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
              {(visual.mode === 'gpt' || visual.mode === 'unsplash') && (
                <div className="absolute top-2 left-2 z-10 pointer-events-none">
                  <Badge variant="secondary" className="text-xs bg-black/70 text-white border border-white/20">
                    {visual.mode === 'unsplash' || visual.imageSource === 'unsplash' ? '?? Unsplash AI' : '?? GPT Static'} � Video: {(videoZoom * 100).toFixed(0)}% � Sub: {(subtitleZoom * 100).toFixed(0)}%
                  </Badge>
                </div>
              )}              {/* Text overlay completely removed */}
              {/* Text overlay completely removed */}
              {(visual.mode === 'unsplash' || (visual.mode === 'gpt' && visual.imageSource === 'unsplash')) && visual.unsplashImageData && (
                <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
                  <div className="bg-black/70 text-white text-xs px-2 py-1 rounded border border-white/20">
                    Photo by{' '}
                    <a
                      href={visual.unsplashImageData.photographerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline pointer-events-auto"
                    >
                      {visual.unsplashImageData.photographer}
                    </a>{' '}
                    on{' '}
                    <a
                      href={visual.unsplashImageData.unsplashUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Unsplash
                    </a>
                  </div>
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
              variant={selectedMode === 'unsplash' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectedMode('unsplash')
                setImageSource('unsplash')
                setShowUnsplashSearch(true)
              }}
              disabled={isGenerating || visual?.status === 'completed'}
              className="flex-1"
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Unsplash AI
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {selectedMode === 'gpt' 
              ? '?? Static: Academic visuals with DALL-E 3 (faster, cheaper)' 
              : '?? Unsplash: High-quality images from Unsplash library'}
          </p>
        </div>

        {/* Image Source Selection (only for GPT Static mode) */}
        {selectedMode === 'gpt' && (
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">Image Source:</label>
            <div className="flex gap-2">
              <Button
                variant={imageSource === 'ai' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setImageSource('ai')
                  setShowUnsplashSearch(false)
                }}
                disabled={isGenerating || visual?.status === 'completed'}
                className="flex-1"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                AI Generation
              </Button>
              <Button
                variant={imageSource === 'unsplash' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setImageSource('unsplash')
                  setShowUnsplashSearch(true)
                }}
                disabled={isGenerating || visual?.status === 'completed'}
                className="flex-1"
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                Unsplash Search
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {imageSource === 'ai' 
                ? '?? Generate images using AI (DALL-E 3)' 
                : '?? Search and select from high-quality Unsplash library'}
            </p>
          </div>
        )}

        {/* Unsplash Image Search */}
        {selectedMode === 'unsplash' && showUnsplashSearch && (
          <div className="mb-4 p-4 border rounded-lg bg-card">
            <UnsplashImageSearch
              sentence={sentence.text}
              context={typeof context === 'string' ? { fullScript: context } : context}
              onSelectImage={(imageData) => {
                setSelectedUnsplashImage(imageData)
                setShowUnsplashSearch(false)
                toast.success('Image selected! Click Generate to create video.')
              }}
              onCancel={() => setShowUnsplashSearch(false)}
            />
          </div>
        )}

        {/* Selected Unsplash Image Info */}
        {selectedMode === 'unsplash' && selectedUnsplashImage && !showUnsplashSearch && (
          <div className="mb-4 p-3 border rounded-lg bg-muted/50">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Selected Image</p>
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src={selectedUnsplashImage.url}
                    alt={selectedUnsplashImage.description || 'Selected image'}
                    className="w-16 h-10 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {selectedUnsplashImage.description || 'No description'}
                    </p>
                    <p className="text-xs text-primary mt-0.5">
                      Photo by{' '}
                      <a
                        href={selectedUnsplashImage.photographerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {selectedUnsplashImage.photographer}
                      </a>{' '}
                      on{' '}
                      <a
                        href={selectedUnsplashImage.unsplashUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        Unsplash
                      </a>
                    </p>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedUnsplashImage(null)
                  setShowUnsplashSearch(true)
                }}
                disabled={isGenerating || visual?.status === 'completed'}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Note: All editing controls (subtitle settings, transitions, etc.) are now in the Final Video Editor */}
        {visual?.status === 'completed' && (
          <div className="mb-4 p-3 bg-muted/50 rounded-md border border-border">
            <p className="text-xs text-muted-foreground text-center">
              💡 Subtitle settings, transitions, and text editing are available in the Final Video Editor
            </p>
          </div>
        )}

        {/* REMOVED: All editing controls moved to Final Video Editor */}
        {false && visual?.status === 'completed' && (visual?.mode === 'gpt' || visual?.mode === 'unsplash') && (
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
                      <span>??</span>
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
                      <span>??</span>
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

                {/* Subtitle Font Size Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span>🔤</span>
                      <span>Font Size</span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{subtitleFontSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubtitleFontSize(Math.max(12, subtitleFontSize - 2))}
                      disabled={subtitleFontSize <= 12}
                      className="h-8 w-8 p-0"
                    >
                      -
                    </Button>
                    <div className="flex-1">
                      <input
                        type="range"
                        min="12"
                        max="72"
                        step="2"
                        value={subtitleFontSize}
                        onChange={(e) => setSubtitleFontSize(parseInt(e.target.value))}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubtitleFontSize(Math.min(72, subtitleFontSize + 2))}
                      disabled={subtitleFontSize >= 72}
                      className="h-8 w-8 p-0"
                    >
                      +
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSubtitleFontSize(42)}
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
                    <span>??</span>
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

                {/* Presentation Text (Bullet Points) Control */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span>📝</span>
                    <span>Presentation Text (Bullet Points)</span>
                  </label>
                  <Textarea
                    value={presentationText.join('\n')}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n').filter(line => line.trim().length > 0)
                      setPresentationText(lines)
                      // Auto-save to visual if it exists
                      if (visual) {
                        const updatedVisual: SentenceVisual = {
                          ...visual,
                          presentationText: lines.length > 0 ? lines : undefined,
                        }
                        setVisual(updatedVisual)
                        onVisualUpdate(sentence.id, updatedVisual)
                      }
                    }}
                    placeholder="One bullet point per line. These appear at the top of the video."
                    className="min-h-[100px] text-sm resize-y bg-background border-border font-mono"
                    disabled={isGenerating}
                  />
                  <p className="text-xs text-muted-foreground">
                    One bullet point per line. These will be baked into the video center.
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-border"></div>

                {/* Subtitle Position Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span>??</span>
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

        {/* Presentation Text (Bullet Points) - BEFORE Generation */}
        {(!visual || visual?.status === 'pending' || visual?.status === 'failed') && !visual?.approved && (
          <div className="mb-4 p-4 border rounded-lg bg-card">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <span>📝</span>
                  <span>Presentation Text (Bullet Points)</span>
                </label>
                {presentationText.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateBulletPointsForSentence}
                    disabled={isGeneratingBulletPoints || isGenerating}
                    className="h-7 text-xs"
                  >
                    {isGeneratingBulletPoints ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>✨ Auto-Generate</>
                    )}
                  </Button>
                )}
              </div>
              <Textarea
                value={presentationText.join('\n')}
                onChange={(e) => {
                  const lines = e.target.value.split('\n').filter(line => line.trim().length > 0)
                  setPresentationText(lines)
                  // Auto-save to visual if it exists
                  if (visual) {
                    const updatedVisual: SentenceVisual = {
                      ...visual,
                      presentationText: lines.length > 0 ? lines : undefined,
                    }
                    setVisual(updatedVisual)
                    onVisualUpdate(sentence.id, updatedVisual)
                  }
                }}
                placeholder={isGeneratingBulletPoints ? "Generating bullet points using Gemini AI..." : "One bullet point per line. Click 'Generate Bullet Points' to auto-generate from the sentence or type your own."}
                className="min-h-[100px] text-sm resize-y bg-background border-border font-mono"
                disabled={isGenerating || isGeneratingBulletPoints}
              />
              <p className="text-xs text-muted-foreground">
                Optional: One bullet point per line. Click "Generate Bullet Points" to auto-generate from the sentence using Gemini AI. If provided, bullet points will be baked into the center of the video. You can also type your own or leave empty.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons - TWO FIXED BUTTONS */}
        <div className="flex flex-wrap gap-2">
          {(!visual || visual?.status === 'pending' || visual?.status === 'failed') && !visual?.approved ? (
            <>
              {/* FIXED GPT BUTTON - Always generates with DALL-E */}
              <Button
                onClick={handleGenerateGPT}
                disabled={isGenerating}
                variant="default"
                className="flex-1 min-w-[150px]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Generate Static (GPT)
                  </>
                )}
              </Button>
              
              {/* FIXED UNSPLASH BUTTON - Always generates with Unsplash */}
              <Button
                onClick={handleGenerateUnsplash}
                disabled={isGenerating || !selectedUnsplashImage}
                variant="outline"
                className="flex-1 min-w-[150px]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Unsplash Videos
                  </>
                )}
              </Button>
            </>
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
