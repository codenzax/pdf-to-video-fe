import { useState, useRef, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  CheckCircle,
  XCircle,
  Play,
  Pause,
  Download,
  Loader2,
  AlertCircle,
  Film,
  Maximize2,
  Volume2,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { videoAssemblyService, VideoSegment, AssemblyRequest } from '@/services/videoAssemblyService'
import { ScriptData } from '@/services/geminiService'

interface VideoTimelineEditorProps {
  scriptData: ScriptData | null
  onExport?: (videoUrl: string, videoBase64: string) => void
}

export function VideoTimelineEditor({
  scriptData,
  onExport,
}: VideoTimelineEditorProps) {
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9')
  const [musicVolume, setMusicVolume] = useState<number>(0.3)
  const [isAssembling, setIsAssembling] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [assembledVideo, setAssembledVideo] = useState<{
    videoUrl: string
    videoBase64: string
    duration: number
  } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isApproved, setIsApproved] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Get approved segments
  const getApprovedSegments = (): VideoSegment[] => {
    if (!scriptData || !scriptData.sentences || !Array.isArray(scriptData.sentences)) {
      console.warn('⚠️ getApprovedSegments: No scriptData or sentences');
      return []
    }

    console.log('🔍 getApprovedSegments - Checking', scriptData.sentences.length, 'sentences');

    return scriptData.sentences.filter(s => {
      // SIMPLE CHECK: visual must be approved AND have videoUrl/imageUrl
      if (!s.visual) {
        return false
      }
      
      const isApproved = s.visual.approved === true
      const hasVideo = !!(s.visual.videoUrl || s.visual.imageUrl)
      
      // Audio is optional - if exists, should be approved
      const audioOk = !s.audio || s.audio.approved === true
      
      const result = isApproved && hasVideo && audioOk
      
      // Log EVERY sentence to debug
      console.log(`🔍 Sentence "${s.id.substring(0, 8)}...":`, {
        hasVisual: !!s.visual,
        approved: isApproved,
        approvedValue: s.visual.approved,
        hasVideo: hasVideo,
        videoUrl: s.visual.videoUrl ? 'YES (' + (s.visual.videoUrl.substring(0, 30) + '...') : 'NO',
        imageUrl: s.visual.imageUrl ? 'YES (' + (s.visual.imageUrl.substring(0, 30) + '...') : 'NO',
        audioOk: audioOk,
        RESULT: result ? '✅ INCLUDED' : '❌ EXCLUDED'
      })
      
      return result
    })
      .map(s => {
        // Extract base64 from data URLs if present
        const videoUrl = s.visual!.videoUrl || ''
        const videoBase64 = videoUrl.startsWith('data:') 
          ? videoUrl.split(',')[1] 
          : undefined
        
        // Handle audio (optional)
        let audioUrl: string | undefined = undefined
        let audioBase64: string | undefined = undefined
        
        if (s.audio && s.audio.approved) {
          const audioUrlOrBase64 = s.audio.audioUrl || ''
          if (audioUrlOrBase64.startsWith('data:')) {
            audioBase64 = audioUrlOrBase64.split(',')[1]
          } else if (audioUrlOrBase64) {
            audioUrl = audioUrlOrBase64
          }
          // Also check audioBase64 field
          if (!audioBase64 && s.audio.audioBase64) {
            audioBase64 = s.audio.audioBase64
          }
        }

        return {
          sentenceId: s.id,
          videoUrl: videoBase64 ? '' : videoUrl, // Use URL only if not base64
          videoBase64,
          audioUrl,
          audioBase64,
          duration: s.audio?.duration || 6, // Default 6 seconds if no audio
          transitionType: s.visual!.transitionType || 'fade',
        }
      })
  }

  // Force recalculation when scriptData changes
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Create a dependency string that changes when approved visuals change
  const approvedVisualsDependency = useMemo(() => {
    if (!scriptData?.sentences) return '';
    return scriptData.sentences
      .map(s => `${s.id}:${s.visual?.approved ? '1' : '0'}:${s.visual?.videoUrl ? 'v' : ''}:${s.visual?.imageUrl ? 'i' : ''}`)
      .join('|');
  }, [scriptData?.sentences]);
  
  // Recalculate approved segments whenever scriptData changes
  const approvedSegments = useMemo(() => {
    const segments = getApprovedSegments() || []
    const approvedCount = scriptData?.sentences?.filter(s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)).length || 0;
    
    console.log('🔄 Recalculating approved segments...', {
      totalSegments: segments.length,
      scriptDataSentences: scriptData?.sentences?.length || 0,
      approvedVisuals: scriptData?.sentences?.filter(s => s.visual?.approved === true).length || 0,
      approvedVisualsWithVideo: approvedCount,
      scriptDataId: scriptData?.id || 'default',
      refreshKey,
    })
    
    // Log each approved segment
    if (segments.length > 0) {
      console.log('✅ Approved segments found:', segments.map(s => ({
        sentenceId: s.sentenceId.substring(0, 8),
        hasVideo: !!s.videoUrl || !!s.videoBase64,
        hasAudio: !!s.audioUrl || !!s.audioBase64,
        duration: s.duration,
      })));
    } else {
      console.warn('⚠️ No approved segments found!', {
        totalSentences: scriptData?.sentences?.length || 0,
        sentencesWithVisual: scriptData?.sentences?.filter(s => s.visual).length || 0,
        approvedVisuals: scriptData?.sentences?.filter(s => s.visual?.approved === true).length || 0,
        approvedWithVideo: approvedCount,
      });
    }
    
    return segments
  }, [scriptData, refreshKey, approvedVisualsDependency])
  
  // Force refresh when scriptData changes, especially when visuals are approved
  useEffect(() => {
    if (scriptData) {
      const approvedCount = scriptData.sentences?.filter(s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)).length || 0
      const approvedVisuals = scriptData.sentences?.filter(s => s.visual?.approved === true) || []
      
      console.log('📊 VideoTimelineEditor - scriptData prop changed, forcing refresh', {
        approvedCount,
        totalSentences: scriptData.sentences?.length || 0,
        scriptDataId: scriptData.id || 'default',
        approvedVisualsDetails: approvedVisuals.map(s => ({
          id: s.id.substring(0, 8),
          approved: s.visual?.approved,
          hasVideo: !!(s.visual?.videoUrl || s.visual?.imageUrl),
          videoUrl: s.visual?.videoUrl ? 'YES' : 'NO',
          imageUrl: s.visual?.imageUrl ? 'YES' : 'NO',
        })),
        dependency: approvedVisualsDependency.substring(0, 100),
      })
      setRefreshKey(prev => prev + 1)
    }
  }, [scriptData, approvedVisualsDependency])

  const approvedSegmentsLength = approvedSegments.length

  // Debug: Log scriptData changes
  useEffect(() => {
    if (scriptData && scriptData.sentences && Array.isArray(scriptData.sentences)) {
      const segments = getApprovedSegments()
      console.log('📊 VideoTimelineEditor - scriptData updated:', {
        totalSentences: scriptData.sentences.length,
        sentencesWithVisual: scriptData.sentences.filter(s => s.visual).length,
        approvedVisuals: scriptData.sentences.filter(s => s.visual?.approved === true).length,
        sentencesWithAudio: scriptData.sentences.filter(s => s.audio).length,
        approvedAudio: scriptData.sentences.filter(s => s.audio?.approved === true).length,
        approvedSegmentsCount: segments?.length || 0,
      })
      
      // Log each sentence's visual/audio status
      scriptData.sentences.forEach((s, idx) => {
        if (s.visual || s.audio) {
          console.log(`📝 Sentence ${idx + 1} (${s.id}):`, {
            text: s.text?.substring(0, 40) + '...' || 'No text',
            visualApproved: s.visual?.approved,
            visualStatus: s.visual?.status,
            hasVideoUrl: !!s.visual?.videoUrl,
            audioApproved: s.audio?.approved,
            audioStatus: s.audio?.status,
          })
        }
      })
    } else {
      console.warn('⚠️ VideoTimelineEditor - scriptData is invalid:', {
        hasScriptData: !!scriptData,
        hasSentences: !!scriptData?.sentences,
        isArray: Array.isArray(scriptData?.sentences),
      })
    }
  }, [scriptData])

  // Video playback controls
  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement || !assembledVideo) return

    const updateTime = () => setCurrentTime(videoElement.currentTime)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    videoElement.addEventListener('timeupdate', updateTime)
    videoElement.addEventListener('ended', handleEnded)

    return () => {
      videoElement.removeEventListener('timeupdate', updateTime)
      videoElement.removeEventListener('ended', handleEnded)
    }
  }, [assembledVideo])

  const handlePreview = async () => {
    if (approvedSegmentsLength === 0) {
      toast.error('No approved segments found. Please approve visuals and audio first.')
      return
    }

    // Check if background music is approved
    if (scriptData?.backgroundMusic && !scriptData.backgroundMusic.approved) {
      toast.error('Please approve the background music before assembling the video.')
      return
    }

    setIsPreviewing(true)
    try {
      // Extract background music from ScriptData
      let backgroundMusicBase64: string | undefined = undefined
      let backgroundMusicUrl: string | undefined = undefined
      let finalMusicVolume = musicVolume

      if (scriptData?.backgroundMusic?.approved && scriptData.backgroundMusic.audioBase64) {
        backgroundMusicBase64 = scriptData.backgroundMusic.audioBase64
        finalMusicVolume = scriptData.backgroundMusic.volume ?? musicVolume
      } else if (scriptData?.backgroundMusic?.approved && scriptData.backgroundMusic.audioUrl) {
        const audioUrl = scriptData.backgroundMusic.audioUrl
        if (audioUrl.startsWith('data:')) {
          backgroundMusicBase64 = audioUrl.split(',')[1]
        } else {
          backgroundMusicUrl = audioUrl
        }
        finalMusicVolume = scriptData.backgroundMusic.volume ?? musicVolume
      }

      const request: AssemblyRequest = {
        segments: approvedSegments,
        aspectRatio,
        musicVolume: finalMusicVolume,
        backgroundMusicBase64,
        backgroundMusicUrl,
      }

      const result = await videoAssemblyService.previewVideo(request)

      // Convert base64 to blob URL
      const videoBlob = base64ToBlob(result.videoBase64, 'video/mp4')
      const videoUrl = URL.createObjectURL(videoBlob)

      setAssembledVideo({
        videoUrl,
        videoBase64: result.videoBase64,
        duration: result.duration,
      })

      toast.success('Video preview generated!')
    } catch (error) {
      console.error('Error generating preview:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate preview'
      toast.error(errorMessage, { duration: 5000 })
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleAssemble = async () => {
    if (approvedSegmentsLength === 0) {
      toast.error('No approved segments found. Please approve visuals and audio first.')
      return
    }

    // Check if background music is approved (if present)
    if (scriptData?.backgroundMusic && !scriptData.backgroundMusic.approved) {
      toast.error('Please approve the background music before assembling the video.')
      return
    }

    setIsAssembling(true)
    try {
      // Extract background music from ScriptData
      let backgroundMusicBase64: string | undefined = undefined
      let backgroundMusicUrl: string | undefined = undefined
      let finalMusicVolume = musicVolume

      if (scriptData?.backgroundMusic?.approved && scriptData.backgroundMusic.audioBase64) {
        backgroundMusicBase64 = scriptData.backgroundMusic.audioBase64
        finalMusicVolume = scriptData.backgroundMusic.volume ?? musicVolume
      } else if (scriptData?.backgroundMusic?.approved && scriptData.backgroundMusic.audioUrl) {
        const audioUrl = scriptData.backgroundMusic.audioUrl
        if (audioUrl.startsWith('data:')) {
          backgroundMusicBase64 = audioUrl.split(',')[1]
        } else {
          backgroundMusicUrl = audioUrl
        }
        finalMusicVolume = scriptData.backgroundMusic.volume ?? musicVolume
      }

      const request: AssemblyRequest = {
        segments: approvedSegments,
        aspectRatio,
        musicVolume: finalMusicVolume,
        backgroundMusicBase64,
        backgroundMusicUrl,
      }

      const result = await videoAssemblyService.assembleVideo(request)

      // Convert base64 to blob URL
      const videoBlob = base64ToBlob(result.videoBase64, 'video/mp4')
      const videoUrl = URL.createObjectURL(videoBlob)

      setAssembledVideo({
        videoUrl,
        videoBase64: result.videoBase64,
        duration: result.duration,
      })

      toast.success('Video assembled successfully!')
    } catch (error) {
      console.error('Error assembling video:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to assemble video'
      toast.error(errorMessage, { duration: 5000 })
    } finally {
      setIsAssembling(false)
    }
  }

  const handlePlayPause = () => {
    const videoElement = videoRef.current
    if (!videoElement || !assembledVideo) return

    if (isPlaying) {
      videoElement.pause()
      setIsPlaying(false)
    } else {
      videoElement.play()
      setIsPlaying(true)
    }
  }

  const handleApprove = () => {
    if (!assembledVideo) {
      toast.error('Please assemble video first')
      return
    }

    setIsApproved(true)
    toast.success('Video approved! Ready for export.')
  }

  const handleReject = () => {
    setIsApproved(false)
    toast.info('Video rejected. Make adjustments and try again.')
  }

  const handleExport = () => {
    if (!assembledVideo || !isApproved) {
      toast.error('Please approve the video before exporting')
      return
    }

    // Download video
    const link = document.createElement('a')
    link.href = assembledVideo.videoUrl
    link.download = `final-video-${Date.now()}.mp4`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Call onExport callback if provided
    if (onExport) {
      onExport(assembledVideo.videoUrl, assembledVideo.videoBase64)
    }

    toast.success('Video exported successfully!')
  }

  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: mimeType })
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-5 w-5" />
          Video Timeline Editor
        </CardTitle>
        <CardDescription>
          Assemble approved visuals and narration into final video
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Approved Segments Summary */}
        <div className="p-4 bg-muted rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Approved Segments</span>
            <div className="flex items-center gap-2">
              <Badge variant={approvedSegmentsLength > 0 ? 'default' : 'secondary'}>
                {approvedSegmentsLength} / {scriptData?.sentences?.length || 0}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log('🔄 Manual refresh triggered')
                  setRefreshKey(prev => prev + 1)
                }}
                className="h-6 px-2"
              >
                🔄
              </Button>
            </div>
          </div>
          {approvedSegmentsLength === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                No approved segments. Please approve visuals and audio for each sentence first.
              </p>
              <div className="text-xs text-muted-foreground">
                <p>Debug Info:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Total sentences: {scriptData?.sentences?.length || 0}</li>
                  <li>Sentences with visual: {scriptData?.sentences?.filter(s => s.visual).length || 0}</li>
                  <li>Approved visuals: {scriptData?.sentences?.filter(s => s.visual?.approved === true).length || 0}</li>
                  <li>Approved with video/image: {scriptData?.sentences?.filter(s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)).length || 0}</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-2 mt-3">
              <p className="text-xs text-muted-foreground mb-2">
                ✅ {approvedSegmentsLength} approved segment{approvedSegmentsLength !== 1 ? 's' : ''} ready for assembly
              </p>
              {approvedSegments.map((segment, index) => {
                const sentence = scriptData?.sentences?.find(s => s.id === segment.sentenceId)
                return (
                  <div 
                    key={segment.sentenceId} 
                    className="flex items-center gap-2 text-sm p-2 bg-background rounded border"
                  >
                    <Badge variant="outline" className="w-8 text-center">
                      {index + 1}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {sentence?.text?.substring(0, 60) || `Segment ${index + 1}`}...
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatTime(segment.duration)}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {segment.transitionType || 'none'} transition
                        </span>
                        {segment.audioUrl || segment.audioBase64 ? (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-xs text-green-600 dark:text-green-400">🎵 Audio</span>
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-xs text-yellow-600 dark:text-yellow-400">⚠️ No audio</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              <Maximize2 className="h-4 w-4 inline mr-2" />
              Aspect Ratio
            </label>
            <div className="flex gap-2">
              <Button
                variant={aspectRatio === '16:9' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAspectRatio('16:9')}
                className="flex-1"
              >
                16:9 (Landscape)
              </Button>
              <Button
                variant={aspectRatio === '9:16' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAspectRatio('9:16')}
                className="flex-1"
              >
                9:16 (Portrait)
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              <Volume2 className="h-4 w-4 inline mr-2" />
              Background Music Volume: {Math.round(musicVolume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={musicVolume * 100}
              onChange={(e) => setMusicVolume(parseInt(e.target.value) / 100)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Adjust background music volume (0% - 100%)
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handlePreview}
            disabled={isPreviewing || isAssembling || approvedSegmentsLength === 0}
            variant="outline"
            className="flex-1"
          >
            {isPreviewing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Preview...
              </>
            ) : (
              <>
                <Video className="h-4 w-4 mr-2" />
                Preview
              </>
            )}
          </Button>
          <Button
            onClick={handleAssemble}
            disabled={isAssembling || isPreviewing || approvedSegmentsLength === 0}
            className="flex-1"
          >
            {isAssembling ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assembling...
              </>
            ) : (
              <>
                <Film className="h-4 w-4 mr-2" />
                Assemble Video
              </>
            )}
          </Button>
        </div>

        {/* Video Player */}
        {assembledVideo && (
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden" style={{
              aspectRatio: aspectRatio === '16:9' ? '16/9' : '9/16',
            }}>
              <video
                ref={videoRef}
                src={assembledVideo.videoUrl}
                className="w-full h-full"
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
              />
            </div>

            {/* Playback Controls */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePlayPause}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(assembledVideo.duration)}</span>
                  </div>
                  <Progress
                    value={(currentTime / assembledVideo.duration) * 100}
                    className="h-2"
                  />
                </div>
              </div>
            </div>

            {/* Approval Gate */}
            {!isApproved ? (
              <div className="flex gap-2">
                <Button
                  onClick={handleApprove}
                  className="flex-1"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve for Export
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReject}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-200">
                    Video Approved - Ready for Export
                  </span>
                </div>
                <Button
                  onClick={handleExport}
                  className="w-full"
                  size="lg"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Final Video
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Status Messages */}
        {approvedSegmentsLength === 0 && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Approve visuals for at least one sentence to assemble video. Audio is optional.
            </p>
          </div>
        )}
        
        {/* Warning if some segments don't have audio */}
        {approvedSegmentsLength > 0 && approvedSegments.some(s => !s.audioUrl && !s.audioBase64) && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Some segments don't have audio. Video will be assembled without narration for those segments.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

