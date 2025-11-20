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
  Play,
  Loader2,
  AlertCircle,
  Video,
  Image as ImageIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { runwayService } from '@/services/runwayService'
import { gptStaticVideoService } from '@/services/gptStaticVideoService'
// Removed unused import
// import { elevenLabsService } from '@/services/elevenLabsService'
import { Sentence, SentenceVisual, SentenceAudio } from '@/services/geminiService'

interface VisualGalleryProps {
  sentence: Sentence
  context?: string // Context from previous sentences or paper metadata
  onApprove: (sentenceId: string) => void
  onReject: (sentenceId: string) => void
  onVisualUpdate: (sentenceId: string, visual: SentenceVisual) => void
  onAudioUpdate?: (sentenceId: string, audio: SentenceAudio) => void // Optional: for auto-generating audio
}

export function VisualGallery({
  sentence,
  context,
  onApprove,
  onReject,
  onVisualUpdate,
  onAudioUpdate,
}: VisualGalleryProps) {
  // Initialize visual from sentence prop - sentence.visual is always the source of truth
  const [visual, setVisual] = useState<SentenceVisual | undefined>(() => {
    // Always use sentence.visual if it exists
    return sentence.visual
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isPolling, setIsPolling] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'gpt' | 'veo3'>(
    sentence.visual?.mode || 'gpt' // Default to GPT static mode
  )
  const [videoZoom, setVideoZoom] = useState<number>(1.0) // Video zoom: 0.5 - 2.0
  const [subtitleYPosition, setSubtitleYPosition] = useState<number>(
    sentence.visual?.subtitleSettings?.yPosition || 880 // Default bottom position
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync visual from sentence prop - sentence.visual is the source of truth
  useEffect(() => {
    // CRITICAL: Always sync from sentence.visual if it exists and is different
    // This ensures that when gallery is hidden/shown, state is properly restored
    if (sentence.visual) {
      // If sentence has approved visual, ALWAYS sync it (source of truth)
      if (sentence.visual.approved === true || sentence.visual.status === 'approved') {
        // Only update if different to avoid infinite loops
        if (!visual || visual.approved !== true || visual.videoUrl !== sentence.visual.videoUrl || visual.imageUrl !== sentence.visual.imageUrl) {
          console.log('✅ Syncing approved visual from sentence (source of truth):', sentence.id, {
            approved: sentence.visual.approved,
            hasVideoUrl: !!sentence.visual.videoUrl,
            hasImageUrl: !!sentence.visual.imageUrl,
          })
          setVisual(sentence.visual)
        }
        return
      }
      
      // If sentence has unapproved visual, sync it if we don't have one or if ours is also unapproved
      if (!visual || (!visual.approved && visual !== sentence.visual)) {
        // Only sync if different
        if (JSON.stringify(visual) !== JSON.stringify(sentence.visual)) {
          console.log('🔄 Syncing unapproved visual from sentence:', sentence.id)
          setVisual(sentence.visual)
        }
      }
      // If we have approved visual but sentence has unapproved, keep ours (don't overwrite approved)
      else if (visual?.approved && !sentence.visual.approved) {
        console.log('🔒 Preserving approved visual, sentence has unapproved:', sentence.id)
        // Don't overwrite - keep approved state
        return
      }
    } else if (!visual) {
      // No visual in sentence and no local visual - initialize (but DON'T call onVisualUpdate to avoid unnecessary saves)
      const newVisual: SentenceVisual = {
        status: 'pending',
        approved: false,
      }
      setVisual(newVisual)
      // REMOVED: Don't call onVisualUpdate here - only call when user actually does something
    }
  }, [sentence.id, sentence.visual]) // Removed visual and onVisualUpdate from deps to avoid loops

  const handleGenerate = async () => {
    if (!sentence.text) {
      toast.error('No sentence text available')
      return
    }

    setIsGenerating(true)
    setProgress(0)

    try {
      // Generate based on selected mode
      if (selectedMode === 'gpt') {
        await handleGenerateGPTStatic()
      } else {
        await handleGenerateVeo3Cinematic()
      }
    } catch (error) {
      console.error('Error generating video:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate video'
      toast.error(errorMessage, { duration: 5000 })
      
      setVisual((prev) =>
        prev
          ? { ...prev, status: 'failed' }
          : { status: 'failed', approved: false }
      )
    } finally {
      setIsGenerating(false)
      setIsPolling(false)
    }
  }

  const handleGenerateGPTStatic = async () => {
    try {
      toast.info('🎨 Step 1/3: Analyzing research context with GPT-4...')
      setProgress(10)

      await new Promise(resolve => setTimeout(resolve, 500))
      
      toast.info('🖼️ Step 2/3: Generating background with DALL-E 3...')
      setProgress(30)
      
      const result = await gptStaticVideoService.generateStaticVideo(
        sentence.text, 
        6,
        {
          fullScript: context,
          // paperTitle and researchDomain can be added later
        },
        'none', // No zoom during generation - user controls zoom after
        transitionType,
        // Pass current subtitle settings so backend bakes them in
        {
          yPosition: subtitleYPosition,
          fontSize: Math.round(subtitleFontSize * subtitleZoom),
        }
      )
      
      toast.info('🎬 Step 3/3: Converting to video with FFMPEG...')
      setProgress(80)
      
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setProgress(100)

      const completedVisual: SentenceVisual = {
        videoId: `gpt-${Date.now()}`,
        status: 'completed',
        imageUrl: result.imageUrl,
        videoUrl: result.videoUrl, // Actual 6-second MP4 video from FFMPEG
        thumbnailUrl: result.imageUrl,
        approved: false, // Manual approval gate
        mode: 'gpt',
        transitionType: transitionType,
        subtitleSettings: {
          yPosition: subtitleYPosition,
          fontSize: subtitleFontSize,
          zoom: subtitleZoom,
        },
      }

      setVisual(completedVisual)
      onVisualUpdate(sentence.id, completedVisual)
      toast.success('✅ Video ready! Review and click Approve to send to Editor.')
    } catch (error: any) {
      // Enhanced error messages
      let errorMsg = 'Failed to generate static video';
      
      if (error.message?.includes('DALL-E')) {
        errorMsg = '❌ DALL-E Error: OpenAI server issue. Please wait 10 seconds and try again.';
      } else if (error.message?.includes('GPT')) {
        errorMsg = '❌ GPT Error: Failed to analyze context. Check your OpenAI API key.';
      } else if (error.message?.includes('FFMPEG')) {
        errorMsg = '❌ FFMPEG Error: Video conversion failed. Check backend logs.';
      } else if (error.message?.includes('Canvas')) {
        errorMsg = '❌ Canvas Error: Image processing failed.';
      }
      
      toast.error(errorMsg, { duration: 6000 });
      throw error; // Re-throw to be caught by parent handler
    }
  }

  const handleGenerateVeo3Cinematic = async () => {
            // Generate video using Fal.AI VEO 3 Fast
            // For 15 sentences at 6 seconds each = 90 seconds total
            toast.info('Starting cinematic video generation with Fal.AI VEO 3...')
      
      const result = await runwayService.generateVideo(
        sentence.text,
        'veo3', // Using VEO 3 model via Fal.AI
        {
          fullScript: context,
        }
      )

      const taskId = result.taskId;

      // Check if video is already completed (synchronous response)
      if (result.status === 'COMPLETED' && (result as any).output && (result as any).output.length > 0) {
        setProgress(100);
        
        const completedVisual: SentenceVisual = {
          videoId: taskId,
          status: 'completed',
          videoUrl: (result as any).output[0],
          thumbnailUrl: (result as any).output[0],
          approved: false, // Manual approval gate
          mode: 'veo3',
          transitionType: transitionType,
          subtitleSettings: {
            yPosition: subtitleYPosition,
            fontSize: subtitleFontSize,
            zoom: subtitleZoom,
          },
        };

        setVisual(completedVisual);
        onVisualUpdate(sentence.id, completedVisual);
        toast.success('✅ Video generated! Review and click Approve to send to Editor.');
        return;
      }

      // Otherwise, proceed with polling
      const newVisual: SentenceVisual = {
        videoId: taskId,
        status: 'generating',
        approved: false,
      }

      setVisual(newVisual)
      onVisualUpdate(sentence.id, newVisual)

      // Start polling for status
      setIsPolling(true)
      setProgress(10)
      toast.info('Video is being generated. This may take 30-60 seconds...')

            const videoUrls = await runwayService.pollTaskUntilComplete(
              taskId,
              (status) => {
                // Update progress based on status
                if (status === 'IN_QUEUE') {
                  setProgress(20)
                } else if (status === 'IN_PROGRESS') {
                  setProgress(50)
                }

                setVisual((prev) =>
                  prev
                    ? {
                        ...prev,
                        status: status === 'COMPLETED' ? 'completed' : 'generating',
                      }
                    : prev
                )
              },
              180, // max attempts (15 minutes - MiniMax takes longer but better quality)
              5000 // 5 second intervals
            )

      // Video generation completed successfully
      setProgress(100)
      
      const completedVisual: SentenceVisual = {
        videoId: taskId,
        status: 'completed',
        videoUrl: videoUrls[0],
        thumbnailUrl: videoUrls[0],
        approved: false, // Manual approval gate
        mode: 'veo3',
        transitionType: transitionType,
        subtitleSettings: {
          yPosition: subtitleYPosition,
          fontSize: subtitleFontSize,
          zoom: subtitleZoom,
        },
      }

      setVisual(completedVisual)
      onVisualUpdate(sentence.id, completedVisual)
      toast.success('✅ Cinematic video generated! Review and click Approve to send to Editor.')
  }

  // Removed unused function generateAudioAutomatically

  const handleRegenerate = async () => {
    // Regenerate simply calls the same generation logic
    toast.info('Regenerating video...')
    await handleGenerate()
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

    setIsGenerating(true)

    try {
      // Create a local URL for the uploaded video
      const videoUrl = URL.createObjectURL(file)

      const uploadedVisual: SentenceVisual = {
        videoId: `uploaded-${Date.now()}`,
        status: 'completed',
        videoUrl: videoUrl,
        thumbnailUrl: videoUrl, // Use video as thumbnail
        approved: false,
        uploaded: true,
      }

      setVisual(uploadedVisual)
      onVisualUpdate(sentence.id, uploadedVisual)
      toast.success('Video uploaded successfully!')
    } catch (error) {
      console.error('Error uploading video:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to upload video')
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
      // CRITICAL: Preserve videoUrl and imageUrl - don't lose them!
      videoUrl: visual.videoUrl, // Explicitly preserve
      imageUrl: visual.imageUrl, // Explicitly preserve
      thumbnailUrl: visual.thumbnailUrl, // Preserve thumbnail
      mode: visual.mode, // Preserve mode
      transitionType: visual.transitionType || transitionType, // Preserve transition
      // CRITICAL: Always save subtitle settings (for all modes with subtitles)
      // These are used for Canvas text overlay in final video
        subtitleSettings: {
          yPosition: subtitleYPosition,
          fontSize: subtitleFontSize,
          zoom: subtitleZoom,
        }
    }

    console.log('✅ Video approved - FULL STATE:', {
      sentenceId: sentence.id,
      videoUrl: approvedVisual.videoUrl ? 'YES' : 'NO',
      imageUrl: approvedVisual.imageUrl ? 'YES' : 'NO',
      videoUrlValue: approvedVisual.videoUrl?.substring(0, 50) || 'MISSING',
      imageUrlValue: approvedVisual.imageUrl?.substring(0, 50) || 'MISSING',
      mode: approvedVisual.mode,
      approved: approvedVisual.approved,
      status: approvedVisual.status,
    });

    setVisual(approvedVisual)
    
    // CRITICAL: Call onVisualUpdate IMMEDIATELY with complete data
    console.log('📤 Calling onVisualUpdate with approved visual...')
    onVisualUpdate(sentence.id, approvedVisual)
    
    onApprove(sentence.id)
    
    // AUTO-GENERATE AUDIO when video is approved
    if (onAudioUpdate && sentence.text && !sentence.audio?.audioUrl && !sentence.audio?.audioBase64) {
      console.log('🎵 Auto-generating audio for approved video...', sentence.id)
      toast.info('🎵 Auto-generating audio narration for this video...')
      
      try {
        // Import elevenLabsService for audio generation
        const { elevenLabsService } = await import('@/services/elevenLabsService')
        
        // Generate audio automatically
        const result = await elevenLabsService.generateAudio({
          text: sentence.text,
          sentenceId: sentence.id,
          voiceId: '21m00Tcm4TlvDq8ikWAM', // Default: Rachel - professional female voice
        })

        const autoGeneratedAudio: SentenceAudio = {
          ...result,
          approved: true, // AUTO-APPROVE audio when video is approved
          status: 'approved',
          isCustom: false,
        }

        console.log('✅ Auto-generated and auto-approved audio:', {
          sentenceId: sentence.id,
          hasAudioUrl: !!autoGeneratedAudio.audioUrl,
          hasAudioBase64: !!autoGeneratedAudio.audioBase64,
        })

        // Attach audio to sentence
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
            <CardTitle className="text-lg">Visual for Sentence {sentence.id}</CardTitle>
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
        {/* Video Preview */}
        <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden">
          {visual?.videoUrl ? (
            <div className="w-full h-full relative overflow-hidden">
              {/* Background Video (no text) */}
              <video
                src={visual.videoUrl}
                controls
                loop={visual.mode === 'gpt'} // Loop for static videos
                autoPlay={visual.mode === 'gpt'}
                muted={visual.mode === 'gpt'}
                className="w-full h-full object-cover transition-transform duration-300"
                style={{
                  transform: `scale(${videoZoom})`,
                  transformOrigin: 'center center',
                }}
                poster={visual.thumbnailUrl}
              >
                Your browser does not support the video tag.
              </video>

              {/* HTML Subtitle Overlay disabled (subtitles are baked in video) */}
              {false && visual?.mode === 'gpt' && (
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{
                    top: `${(subtitleYPosition / 1080) * 100}%`,
                    transform: `translateY(-50%) scale(${subtitleZoom})`,
                    transformOrigin: 'center',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div 
                    className="px-8 py-4 bg-gradient-to-b from-black/70 to-black/90 backdrop-blur-sm"
                    style={{
                      fontSize: `${subtitleFontSize}px`,
                    }}
                  >
                    <p className="text-white font-bold text-center leading-tight drop-shadow-lg" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9)' }}>
                      {sentence.text}
                    </p>
                  </div>
                </div>
              )}

              {/* Mode Badge */}
              {visual.mode === 'gpt' && (
                <div className="absolute top-2 left-2 z-10 pointer-events-none">
                  <Badge variant="secondary" className="text-xs bg-black/70 text-white border border-white/20">
                    🎨 GPT Static • Video: {(videoZoom * 100).toFixed(0)}% • Sub: {(subtitleZoom * 100).toFixed(0)}%
                  </Badge>
                </div>
              )}
            </div>
          ) : visual?.thumbnailUrl ? (
            <div className="relative w-full h-full">
              <img
                src={visual.thumbnailUrl}
                alt="Video thumbnail"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => {
                    if (visual.videoUrl) {
                      window.open(visual.videoUrl, '_blank')
                    }
                  }}
                >
                  <Play className="h-6 w-6" />
                </Button>
              </div>
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
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
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

        {/* Live Controls (only show after GPT video is generated) */}
        {visual?.status === 'completed' && visual?.mode === 'gpt' && (
          <div className="space-y-4 mb-4 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Video className="h-4 w-4" />
              <span className="text-sm font-semibold">Live Video & Subtitle Controls</span>
            </div>

            {/* Video Zoom Control */}
            <div>
              <label className="text-sm font-medium mb-2 block">🎬 Video Zoom: {(videoZoom * 100).toFixed(0)}%</label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVideoZoom(Math.max(0.5, videoZoom - 0.1))}
                  disabled={videoZoom <= 0.5}
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
                    className="w-full"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVideoZoom(Math.min(2.0, videoZoom + 0.1))}
                  disabled={videoZoom >= 2.0}
                >
                  +
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setVideoZoom(1.0)}
                >
                  Reset
                </Button>
              </div>
            </div>

            {/* Subtitle Zoom Control */}
            <div>
              <label className="text-sm font-medium mb-2 block">📝 Subtitle Size: {(subtitleZoom * 100).toFixed(0)}%</label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubtitleZoom(Math.max(0.5, subtitleZoom - 0.1))}
                  disabled={subtitleZoom <= 0.5}
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
                    className="w-full"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubtitleZoom(Math.min(2.0, subtitleZoom + 0.1))}
                  disabled={subtitleZoom >= 2.0}
                >
                  +
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSubtitleZoom(1.0)}
                >
                  Reset
                </Button>
              </div>
            </div>

            {/* Subtitle Position Control */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                📍 Subtitle Position: {subtitleYPosition <= 250 ? 'Top' : subtitleYPosition < 750 ? 'Center' : 'Bottom'} ({Math.round(subtitleYPosition)}px)
              </label>
              
              {/* Quick Position Buttons */}
              <div className="flex gap-2 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubtitleYPosition(200)}
                  className="flex-1"
                >
                  Top
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubtitleYPosition(540)}
                  className="flex-1"
                >
                  Center
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubtitleYPosition(880)}
                  className="flex-1"
                >
                  Bottom
                </Button>
              </div>

              {/* Fine-tune Slider */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubtitleYPosition(Math.max(100, subtitleYPosition - 50))}
                  disabled={subtitleYPosition <= 100}
                >
                  ↑ Up
                </Button>
                <div className="flex-1">
                  <input
                    type="range"
                    min="100"
                    max="980"
                    step="10"
                    value={subtitleYPosition}
                    onChange={(e) => setSubtitleYPosition(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubtitleYPosition(Math.min(980, subtitleYPosition + 50))}
                  disabled={subtitleYPosition >= 980}
                >
                  ↓ Down
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use slider or buttons to position subtitle anywhere (100px - 980px)
              </p>
            </div>
          </div>
        )}

        {/* Transition Type Selection */}
        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block">Transition to Next Scene:</label>
          <p className="text-xs text-muted-foreground mb-2">
            ℹ️ Transitions will be applied during final video export
          </p>
          <div className="flex gap-2">
            <Button
              variant={transitionType === 'fade' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTransitionType('fade')}
              disabled={isGenerating}
              className="flex-1"
            >
              Fade
            </Button>
            <Button
              variant={transitionType === 'slide' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTransitionType('slide')}
              disabled={isGenerating}
              className="flex-1"
            >
              Slide
            </Button>
            <Button
              variant={transitionType === 'dissolve' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTransitionType('dissolve')}
              disabled={isGenerating}
              className="flex-1"
            >
              Dissolve
            </Button>
            <Button
              variant={transitionType === 'none' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTransitionType('none')}
              disabled={isGenerating}
              className="flex-1"
            >
              None
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Only show generate button if not approved */}
          {(!visual || visual?.status === 'pending' || visual?.status === 'failed') && !visual?.approved ? (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex-1 min-w-[120px]"
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
          ) : visual?.status === 'completed' && !visual?.approved ? (
            <>
              <Button
                onClick={handleApprove}
                variant="default"
                className="flex-1 min-w-[180px] bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Export to Video Assembly
              </Button>
              <Button
                onClick={handleReject}
                variant="destructive"
                className="flex-1 min-w-[100px]"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={handleRegenerate}
                variant="outline"
                disabled={isGenerating}
                className="flex-1 min-w-[120px]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Regenerate
                  </>
                )}
              </Button>
              <Button
                onClick={() => {
                  const newMode = selectedMode === 'gpt' ? 'veo3' : 'gpt';
                  setSelectedMode(newMode);
                  setVisual((prev) => prev ? { ...prev, status: 'pending' } : undefined);
                  toast.info(`Switched to ${newMode === 'gpt' ? 'GPT Static' : 'VEO 3 Cinematic'} mode`);
                }}
                variant="secondary"
                className="flex-1 min-w-[120px]"
              >
                {selectedMode === 'gpt' ? <Video className="h-4 w-4 mr-2" /> : <ImageIcon className="h-4 w-4 mr-2" />}
                Switch to {selectedMode === 'gpt' ? 'VEO 3' : 'GPT'}
              </Button>
            </>
          ) : visual?.approved ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg w-full">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                ✅ Video Approved - Ready for Assembly
              </span>
            </div>
          ) : null}

          <Button
            onClick={handleUpload}
            variant="outline"
            disabled={isGenerating}
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
