import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
// Removed unused import
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Sparkles,
  Type,
  Image as ImageIcon,
  Zap,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { videoAssemblyService, VideoSegment, AssemblyRequest } from '@/services/videoAssemblyService'
import { ScriptData, SentenceVisual, SentenceAudio } from '@/services/geminiService'

interface VideoTimelineEditorProps {
  scriptData: ScriptData | null
  onExport?: (videoUrl: string, videoBase64: string) => void
  onVisualUpdate?: (sentenceId: string, visual: SentenceVisual) => void
  onAudioUpdate?: (sentenceId: string, audio: SentenceAudio) => void
  onVisualApprove?: (sentenceId: string) => void
  onAudioApprove?: (sentenceId: string) => void
  onScriptUpdate?: (scriptData: ScriptData) => void // For saving final video state
  paperContext?: string
}

export function VideoTimelineEditor({
  scriptData,
  onExport,
  onVisualUpdate,
  // Removed unused prop
  onVisualApprove,
  onAudioApprove,
  onScriptUpdate,
  // Removed unused prop
  // paperContext,
}: VideoTimelineEditorProps) {
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9')
  const [musicVolume, setMusicVolume] = useState<number>(0.15) // Default 15% for background music
  const [isAssembling, setIsAssembling] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [assembledVideo, setAssembledVideo] = useState<{
    videoUrl: string
    videoBase64: string
    duration: number
    exportedAt?: string
    isExported?: boolean
  } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isApproved, setIsApproved] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set())
  const currentBlobUrlRef = useRef<string | null>(null)
  const currentBlobRef = useRef<Blob | null>(null) // Keep blob object in memory to prevent GC
  const isCreatingBlobRef = useRef<boolean>(false) // Prevent concurrent blob creation

  const safeRevokeBlob = (url?: string | null) => {
    if (!url) return
    try {
      // If video element is currently pointing to this URL, clear it first
      if (videoRef.current) {
        const currentSrc = videoRef.current.src || videoRef.current.currentSrc
        if (currentSrc === url || currentSrc.includes(url.split('/').pop() || '')) {
          try {
            videoRef.current.pause()
          } catch {}
          try {
            videoRef.current.removeAttribute('src')
            videoRef.current.load()
          } catch {}
        }
      }
      URL.revokeObjectURL(url)
      // Clear blob reference too
      if (currentBlobRef.current) {
        currentBlobRef.current = null
      }
      console.log('🗑️ Revoked blob URL:', url.substring(0, 50))
    } catch (e) {
      console.error('Error revoking blob URL:', e)
    }
  }

  // Helper function to convert base64 to Blob
  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: mimeType })
  }

  // Load assembled video from ScriptData on mount or when scriptData changes
  useEffect(() => {
    if (scriptData?.finalVideo && !assembledVideo) {
      // Restore assembled video from ScriptData
      const finalVideo = scriptData.finalVideo
      
      // CRITICAL: Only restore if we have base64 - NEVER trust any videoUrl (even non-blob)
      // Always create fresh blob URL from base64
      if (finalVideo.videoBase64) {
        // Revoke any existing blob URL first
        if (currentBlobUrlRef.current) {
          safeRevokeBlob(currentBlobUrlRef.current)
        }
        
        // Validate base64 before creating blob
        try {
          atob(finalVideo.videoBase64.substring(0, 100))
        } catch (e) {
          console.error('❌ Invalid base64 in finalVideo, skipping restore:', e)
          currentBlobUrlRef.current = null
          setAssembledVideo(null)
          return
        }
        
        const videoBlob = base64ToBlob(finalVideo.videoBase64, 'video/mp4')
        
        // Validate blob
        if (!videoBlob || videoBlob.size === 0) {
          console.error('❌ Invalid blob created from finalVideo base64')
          currentBlobUrlRef.current = null
          currentBlobRef.current = null
          setAssembledVideo(null)
          return
        }
        
        // CRITICAL: Keep blob object in ref to prevent garbage collection
        currentBlobRef.current = videoBlob
        
        const videoUrl = URL.createObjectURL(videoBlob)
        // Track current blob URL for cleanup
        currentBlobUrlRef.current = videoUrl
        
        console.log('✅ Restored blob URL:', {
          blobUrl: videoUrl.substring(0, 50) + '...',
          blobSize: `${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`,
        })
        
        // Set video element src IMMEDIATELY
        if (videoRef.current) {
          try {
            videoRef.current.src = videoUrl
            videoRef.current.load()
            console.log('✅ Applied restored blob URL to video element immediately')
          } catch (e) {
            console.error('❌ Failed to apply restored blob URL:', e)
            // Fallback async
            setTimeout(() => {
              if (videoRef.current && currentBlobUrlRef.current === videoUrl) {
                try {
                  videoRef.current.src = videoUrl
                  videoRef.current.load()
                } catch (e2) {
                  console.error('❌ Async fallback also failed:', e2)
                }
              }
            }, 100)
          }
        }
        
        setAssembledVideo({
          videoUrl: '', // NEVER store blob URL in state
          videoBase64: finalVideo.videoBase64,
          duration: finalVideo.duration,
          exportedAt: finalVideo.exportedAt,
          isExported: finalVideo.isExported || false,
        })
        
        if (finalVideo.isExported) {
          setIsApproved(true)
        }
        
        console.log('📥 Restored assembled video from ScriptData:', {
          hasVideo: !!finalVideo.videoBase64,
          isExported: finalVideo.isExported,
          createdBlobUrl: videoUrl,
        })
      } else if (finalVideo.videoUrl && !finalVideo.videoUrl.startsWith('blob:')) {
        // Use existing non-blob URL (HTTP/HTTPS)
        currentBlobUrlRef.current = null // Clear any blob URL
        setAssembledVideo({
          videoUrl: finalVideo.videoUrl,
          videoBase64: finalVideo.videoBase64 || '',
          duration: finalVideo.duration,
          exportedAt: finalVideo.exportedAt,
          isExported: finalVideo.isExported || false,
        })
        
        if (finalVideo.isExported) {
          setIsApproved(true)
        }
      } else {
        // No valid video data or stale blob URL - clear it
        console.warn('⚠️ No valid video data in finalVideo (missing base64)')
        currentBlobUrlRef.current = null
        setAssembledVideo(null)
      }
    } else if (!scriptData?.finalVideo && assembledVideo?.isExported) {
      // Clear if scriptData is cleared
      safeRevokeBlob(currentBlobUrlRef.current)
      currentBlobUrlRef.current = null
      setAssembledVideo(null)
      setIsApproved(false)
    }
    
    // CRITICAL: Force refresh approved segments when scriptData loads or changes
    // This ensures approved videos show immediately after page reload
    if (scriptData && scriptData.sentences) {
      const approvedVideos = scriptData.sentences.filter(s => {
        const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
        const hasVideo = !!(s.visual?.videoUrl || s.visual?.imageUrl)
        return isApproved && hasVideo
      })
      
      if (approvedVideos.length > 0) {
        console.log('🔄 Detected approved videos in scriptData, forcing refresh...', {
          count: approvedVideos.length,
          sentenceIds: approvedVideos.map(s => s.id.substring(0, 8)),
          details: approvedVideos.map(s => ({
            id: s.id.substring(0, 8),
            text: s.text.substring(0, 30) + '...',
            approved: s.visual?.approved,
            status: s.visual?.status,
            hasVideoUrl: !!s.visual?.videoUrl,
            hasImageUrl: !!s.visual?.imageUrl,
          })),
        })
        setRefreshKey(prev => prev + 1)
      }
    }
  }, [scriptData, assembledVideo])

  // CRITICAL: Ensure blob URL is always valid when assembledVideo has base64
  useEffect(() => {
    if (assembledVideo?.videoBase64 && !currentBlobUrlRef.current && !isCreatingBlobRef.current) {
      // Create blob URL if we have base64 but no blob URL
      console.log('🔁 useEffect: Creating blob URL from base64')
      const success = recreateBlobFromBase64()
      if (!success) {
        console.error('❌ Failed to create blob URL in useEffect')
      }
    }
    
    // Cleanup on unmount only
    return () => {
      // Only cleanup on component unmount
      if (currentBlobUrlRef.current) {
        console.log('🧹 Component unmounting, cleaning up blob URL')
        safeRevokeBlob(currentBlobUrlRef.current)
        currentBlobUrlRef.current = null
      }
      if (currentBlobRef.current) {
        currentBlobRef.current = null
      }
      isCreatingBlobRef.current = false
    }
  }, [assembledVideo?.videoBase64])
  
  // Editing options
  const [brightness, setBrightness] = useState<number>(100)
  const [contrast, setContrast] = useState<number>(100)
  const [saturation, setSaturation] = useState<number>(100)
  const [videoFilter, setVideoFilter] = useState<string>('none')
  const [textOverlay, setTextOverlay] = useState<string>('')
  const [textPosition, setTextPosition] = useState<'top' | 'center' | 'bottom'>('bottom')
  const [textSize, setTextSize] = useState<number>(24)
  const [textColor, setTextColor] = useState<string>('#FFFFFF')
  const [autoAssemble, setAutoAssemble] = useState<boolean>(true)
  const [hasAutoAssembled, setHasAutoAssembled] = useState<boolean>(false)
  
  // Per-segment editing (crop, transition, subtitle)
  const [segmentEdits, setSegmentEdits] = useState<Record<string, {
    startTime?: number
    endTime?: number
    transitionType?: 'fade' | 'slide' | 'dissolve' | 'none'
    subtitleText?: string
    subtitleSize?: number
    subtitleColor?: string
    subtitlePosition?: number
  }>>({})
  
  // Track expanded segments
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set())

  // Helper: detect if a URL/base64 looks like a playable video source
  const isLikelyVideoSource = (src?: string): boolean => {
    if (!src) return false
    const lower = src.toLowerCase()
    // Accept blob/object URLs, mp4/http(s) with .mp4, or data:video base64
    return (
      lower.startsWith('blob:') ||
      lower.includes('.mp4') ||
      lower.startsWith('http') && lower.includes('.mp4') ||
      lower.startsWith('data:video')
    )
  }

  // Force recalculation when scriptData changes
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Create a dependency string that changes when approved visuals change
  const approvedVisualsDependency = useMemo(() => {
    if (!scriptData?.sentences) return '';
    return scriptData.sentences
      .map(s => `${s.id}:${(s.visual?.approved || s.visual?.status === 'approved' || s.approved) ? '1' : '0'}:${s.visual?.videoUrl ? 'v' : ''}:${s.visual?.imageUrl ? 'i' : ''}`)
      .join('|');
  }, [scriptData?.sentences]);

  // Get approved segments
  const approvedSegments = useMemo((): VideoSegment[] => {
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
      
      // FIXED: Check approved properly (boolean true, string "true", or status === 'approved')
      const isApproved = (
        s.visual.approved === true ||
        s.visual.status === 'approved' ||
        s.approved === true
      )
      
      // Check if video/image exists (even if not a "likely video source" - we'll handle conversion)
      const hasVideoUrl = !!s.visual.videoUrl
      const hasImageUrl = !!s.visual.imageUrl
      const hasVideo = hasVideoUrl || hasImageUrl
      
      // Audio is optional - if video is approved, audio will be auto-attached if available
      // Don't block approval if audio doesn't exist
      // Audio is optional - always allow
      
      const result = isApproved && hasVideo
      
      // Log EVERY sentence to debug (only log if not approved to reduce noise)
      if (!result) {
        // Only log if it has a visual (to reduce noise from sentences without visuals)
        if (s.visual) {
          console.log(`❌ Sentence "${s.id.substring(0, 8)}...": NOT APPROVED`, {
            hasVisual: !!s.visual,
            approved: s.visual.approved,
            approvedType: typeof s.visual.approved,
            status: s.visual.status,
            isApproved: isApproved,
            hasVideo: hasVideo,
            hasVideoUrl: hasVideoUrl,
            hasImageUrl: hasImageUrl,
            videoUrl: s.visual.videoUrl ? s.visual.videoUrl.substring(0, 50) : 'NO',
            imageUrl: s.visual.imageUrl ? s.visual.imageUrl.substring(0, 50) : 'NO',
            sentenceApproved: s.approved,
          })
        }
      } else {
        console.log(`✅ Sentence "${s.id.substring(0, 8)}...": APPROVED - WILL APPEAR IN EDITOR`, {
          approved: s.visual.approved,
          approvedType: typeof s.visual.approved,
          status: s.visual.status,
          hasVideoUrl: hasVideoUrl,
          hasImageUrl: hasImageUrl,
          videoUrl: s.visual.videoUrl ? s.visual.videoUrl.substring(0, 30) + '...' : 'NO',
          imageUrl: s.visual.imageUrl ? s.visual.imageUrl.substring(0, 30) + '...' : 'NO',
        })
      }
      
      return result
    })
      .map(s => {
        // Extract base64 from data URLs if present
        // Handle both videoUrl (VEO3) and imageUrl (GPT static videos)
        let videoUrl = s.visual!.videoUrl || ''
        let imageUrl = s.visual!.imageUrl || ''
        
        // Promote imageUrl to videoUrl if:
        // 1) it is already a video source, or
        // 2) it looks like an image but has a sibling mp4 (common provider pattern)
        if (!videoUrl && imageUrl) {
          if (isLikelyVideoSource(imageUrl)) {
            videoUrl = imageUrl
            imageUrl = ''
          } else {
            // Heuristic: replace image extension with .mp4
            // Removed unused variable
            const tryExtSwap = (u: string) => u.replace(/\.(png|jpg|jpeg|webp)(\?.*)?$/i, '.mp4$2')
            const candidates: string[] = [
              tryExtSwap(imageUrl),
              imageUrl.replace('/image/', '/video/'),
              imageUrl.replace('/images/', '/video/'),
              imageUrl.replace('/thumbnails/', '/videos/'),
            ]
            const firstValid = candidates.find(c => isLikelyVideoSource(c))
            if (firstValid) {
              console.log('🔁 Promoted image path to video path:', { from: imageUrl, to: firstValid })
              videoUrl = firstValid
              imageUrl = ''
            }
          }
        }
        
        const videoBase64 = videoUrl.startsWith('data:') 
          ? videoUrl.split(',')[1] 
          : undefined
        
        // Also check imageUrl for base64 data
        const imageBase64 = imageUrl.startsWith('data:') && !videoBase64
          ? imageUrl.split(',')[1]
          : undefined
        
        // Handle audio (optional) - automatically attach if available, even if not approved
        // When video is approved, use audio if it exists (auto-attach)
        let audioUrl: string | undefined = undefined
        let audioBase64: string | undefined = undefined
        
        // If video is approved, automatically use audio if it exists (even if not explicitly approved)
        if (s.audio && (s.audio.approved || isApproved)) {
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

        // Use imageBase64 if videoBase64 is not available (GPT static videos)
        const finalVideoBase64 = videoBase64 || (imageBase64 && isLikelyVideoSource(imageUrl) ? imageBase64 : undefined)
        const finalVideoUrl = finalVideoBase64 ? '' : (isLikelyVideoSource(videoUrl) ? videoUrl : '')

        // Guard: skip if we still don't have a valid video source
        if (!finalVideoBase64 && !isLikelyVideoSource(finalVideoUrl)) {
          console.warn('⚠️ Skipping segment without valid video source:', {
            sentenceId: s.id,
            videoUrl,
            imageUrl,
          })
          return null as any
        }

              // Get segment-specific edits
              const edits = segmentEdits[s.id] || {}
              const baseDuration = s.audio?.duration || 6
              const startTime = edits.startTime ?? 0
              const endTime = edits.endTime ?? baseDuration
              const actualDuration = Math.max(0.1, endTime - startTime) // Ensure positive duration
              
              return {
                sentenceId: s.id,
                videoUrl: finalVideoUrl, // Use URL only if not base64
                videoBase64: finalVideoBase64,
                audioUrl,
                audioBase64,
                duration: actualDuration,
                startTime: startTime > 0 ? startTime : undefined,
                endTime: endTime < baseDuration ? endTime : undefined,
                transitionType: edits.transitionType || s.visual!.transitionType || 'fade',
                // CRITICAL: Include subtitleSettings for Canvas text overlay
                subtitleSettings: s.visual!.subtitleSettings ? {
                  ...s.visual!.subtitleSettings,
                  fontSize: edits.subtitleSize ?? s.visual!.subtitleSettings.fontSize,
                  yPosition: edits.subtitlePosition ?? s.visual!.subtitleSettings.yPosition,
                } : undefined,
              } as VideoSegment
      })
      // Filter out any nulls from guard above
      .filter(Boolean) as VideoSegment[]
  }, [scriptData, refreshKey, approvedVisualsDependency, segmentEdits])
  
  // Removed unused function
  
  // Log approved segments when they change
  useEffect(() => {
    const approvedCount = scriptData?.sentences?.filter(s => {
      const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
      const hasVideo = !!(s.visual?.videoUrl || s.visual?.imageUrl)
      return isApproved && hasVideo
    }).length || 0;
    
    console.log('🔄 Approved segments updated...', {
      totalSegments: approvedSegments.length,
      scriptDataSentences: scriptData?.sentences?.length || 0,
      approvedVisuals: scriptData?.sentences?.filter(s => {
        const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
        return isApproved
      }).length || 0,
      approvedVisualsWithVideo: approvedCount,
      scriptDataId: scriptData?.id || 'default',
      refreshKey,
      allSentencesWithVisuals: scriptData?.sentences?.map(s => ({
        id: s.id.substring(0, 8),
        hasVisual: !!s.visual,
        approved: s.visual?.approved,
        status: s.visual?.status,
        hasVideoUrl: !!s.visual?.videoUrl,
        hasImageUrl: !!s.visual?.imageUrl,
        videoUrl: s.visual?.videoUrl ? s.visual.videoUrl.substring(0, 40) + '...' : 'NO',
        imageUrl: s.visual?.imageUrl ? s.visual.imageUrl.substring(0, 40) + '...' : 'NO',
      })) || [],
    })
    
    // Log each approved segment
    if (approvedSegments.length > 0) {
      console.log('✅ Approved segments found:', approvedSegments.map(s => ({
        sentenceId: s.sentenceId.substring(0, 8),
        hasVideo: !!s.videoUrl || !!s.videoBase64,
        hasAudio: !!s.audioUrl || !!s.audioBase64,
        duration: s.duration,
        videoUrl: s.videoUrl ? s.videoUrl.substring(0, 40) + '...' : 'NO',
      })));
    } else {
      console.warn('⚠️ No approved segments found!', {
        totalSentences: scriptData?.sentences?.length || 0,
        sentencesWithVisual: scriptData?.sentences?.filter(s => s.visual).length || 0,
        approvedVisuals: scriptData?.sentences?.filter(s => {
          const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
          return isApproved
        }).length || 0,
        approvedWithVideo: approvedCount,
        sentencesDetails: scriptData?.sentences?.filter(s => s.visual).map(s => ({
          id: s.id.substring(0, 8),
          approved: s.visual?.approved,
          status: s.visual?.status,
          hasVideoUrl: !!s.visual?.videoUrl,
          hasImageUrl: !!s.visual?.imageUrl,
          videoUrl: s.visual?.videoUrl || 'NO',
          imageUrl: s.visual?.imageUrl || 'NO',
        })) || [],
      });
    }
  }, [approvedSegments, scriptData, refreshKey])
  
  // Force refresh when scriptData changes, especially when visuals are approved
  useEffect(() => {
    if (scriptData) {
      const approvedCount = scriptData.sentences?.filter(s => {
        const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
        const hasVideo = !!(s.visual?.videoUrl || s.visual?.imageUrl)
        return isApproved && hasVideo
      }).length || 0
      const approvedVisuals = scriptData.sentences?.filter(s => {
        const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
        return isApproved
      }) || []
      
      console.log('📊 VideoTimelineEditor - scriptData prop changed, forcing refresh', {
        approvedCount,
        totalSentences: scriptData.sentences?.length || 0,
        scriptDataId: scriptData.id || 'default',
        approvedVisualsDetails: approvedVisuals.map(s => ({
          id: s.id.substring(0, 8),
          approved: s.visual?.approved,
          status: s.visual?.status,
          hasVideo: !!(s.visual?.videoUrl || s.visual?.imageUrl),
          videoUrl: s.visual?.videoUrl ? s.visual.videoUrl.substring(0, 30) + '...' : 'NO',
          imageUrl: s.visual?.imageUrl ? s.visual.imageUrl.substring(0, 30) + '...' : 'NO',
        })),
        dependency: approvedVisualsDependency.substring(0, 100),
      })
      // Force refresh to recalculate approvedSegments
      setRefreshKey(prev => prev + 1)
    }
  }, [scriptData, approvedVisualsDependency])

  const approvedSegmentsLength = approvedSegments.length

  // Poster image from first approved segment (if any image/thumbnail available)
  const posterUrl = useMemo(() => {
    try {
      const first = (approvedSegments && approvedSegments[0]) ? approvedSegments[0] : undefined
      if (!first) return ''
      const sentence = scriptData?.sentences.find(s => s.id === first.sentenceId)
      const visual = sentence?.visual
      return visual?.thumbnailUrl || (visual?.imageUrl && !isLikelyVideoSource(visual.imageUrl) ? visual.imageUrl : '') || ''
    } catch {
      return ''
    }
  }, [approvedSegments, scriptData])

  // Debug: Log scriptData changes
  useEffect(() => {
    if (scriptData && scriptData.sentences && Array.isArray(scriptData.sentences)) {
      const segments = approvedSegments
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

    setIsPreviewing(true)
    try {
      // Automatically extract and attach background music if available
      let backgroundMusicBase64: string | undefined = undefined
      let backgroundMusicUrl: string | undefined = undefined
      let finalMusicVolume = musicVolume

      // Auto-detect background music from ScriptData (approved or available)
      if (scriptData?.backgroundMusic) {
        if (scriptData.backgroundMusic.audioBase64) {
          backgroundMusicBase64 = scriptData.backgroundMusic.audioBase64
          finalMusicVolume = scriptData.backgroundMusic.volume ?? musicVolume
          console.log('🎵 Preview: Auto-attaching background music from audioBase64', {
            hasBase64: true,
            volume: finalMusicVolume,
          })
        } else if (scriptData.backgroundMusic.audioUrl) {
          const audioUrl = scriptData.backgroundMusic.audioUrl
          if (audioUrl.startsWith('data:')) {
            backgroundMusicBase64 = audioUrl.split(',')[1]
            console.log('🎵 Preview: Auto-attaching background music from data URL')
          } else {
            backgroundMusicUrl = audioUrl
            console.log('🎵 Preview: Auto-attaching background music from URL')
          }
          finalMusicVolume = scriptData.backgroundMusic.volume ?? musicVolume
        }
      } else {
        console.warn('⚠️ Preview: No background music found in scriptData')
      }

      // Ensure all segments have audio attached automatically if available
      const segmentsWithAutoAudio = approvedSegments.map(segment => {
        // If segment doesn't have audio but video is approved, try to find audio from sentence
        if (!segment.audioUrl && !segment.audioBase64 && scriptData) {
          const sentence = scriptData.sentences.find(s => s.id === segment.sentenceId)
          if (sentence?.audio) {
            // Auto-attach audio even if not explicitly approved
            const audioUrlOrBase64 = sentence.audio.audioUrl || ''
            if (audioUrlOrBase64.startsWith('data:')) {
              return {
                ...segment,
                audioBase64: audioUrlOrBase64.split(',')[1]
              }
            } else if (audioUrlOrBase64) {
              return {
                ...segment,
                audioUrl: audioUrlOrBase64
              }
            } else if (sentence.audio.audioBase64) {
              return {
                ...segment,
                audioBase64: sentence.audio.audioBase64
              }
            }
          }
        }
        return segment
      })

      const request: AssemblyRequest = {
        segments: segmentsWithAutoAudio,
        aspectRatio,
        musicVolume: finalMusicVolume,
        backgroundMusicBase64,
        backgroundMusicUrl,
      }

      const result = await videoAssemblyService.previewVideo(request)

      // Revoke old blob URL first
      if (currentBlobUrlRef.current) {
        safeRevokeBlob(currentBlobUrlRef.current)
      }

      // Convert base64 to blob URL
      const videoBlob = base64ToBlob(result.videoBase64, 'video/mp4')
      
      // CRITICAL: Keep blob object in ref to prevent garbage collection
      currentBlobRef.current = videoBlob
      
      const videoUrl = URL.createObjectURL(videoBlob)
      // Track for cleanup
      currentBlobUrlRef.current = videoUrl
      
      // Set video element src IMMEDIATELY (synchronously)
      if (videoRef.current) {
        try {
          videoRef.current.src = videoUrl
          videoRef.current.load()
          console.log('✅ Applied preview blob URL to video element immediately')
        } catch (e) {
          console.error('❌ Failed to apply preview blob URL:', e)
          // Fallback async
          setTimeout(() => {
            if (videoRef.current && currentBlobUrlRef.current === videoUrl) {
              try {
                videoRef.current.src = videoUrl
                videoRef.current.load()
              } catch (e2) {
                console.error('❌ Async fallback also failed:', e2)
              }
            }
          }, 50)
        }
      }

      const previewVideoData = {
        videoUrl: '', // NEVER store blob URL in state
        videoBase64: result.videoBase64,
        duration: result.duration,
        exportedAt: undefined,
        isExported: false,
      }

      setAssembledVideo(previewVideoData)

      // REMOVED AUTO SAVE - Preview is temporary, don't save to DB
      // Final video will be saved only when explicitly exported/approved

      toast.success('Video preview generated!')
    } catch (error) {
      console.error('Error generating preview:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate preview'
      toast.error(errorMessage, { duration: 5000 })
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleAssemble = useCallback(async () => {
    if (approvedSegments.length === 0) {
      toast.error('No approved segments found. Please approve visuals and audio first.')
      return
    }

    if (isAssembling || isPreviewing) {
      return // Prevent duplicate assembly
    }

    setIsAssembling(true)
    try {
      // Automatically extract and attach background music if available
      // Even if not explicitly approved, we'll use it if it exists
      let backgroundMusicBase64: string | undefined = undefined
      let backgroundMusicUrl: string | undefined = undefined
      let finalMusicVolume = musicVolume

      // Auto-detect background music from ScriptData (approved or available)
      if (scriptData?.backgroundMusic) {
        if (scriptData.backgroundMusic.audioBase64) {
          backgroundMusicBase64 = scriptData.backgroundMusic.audioBase64
          finalMusicVolume = scriptData.backgroundMusic.volume ?? musicVolume
          console.log('🎵 Auto-attaching background music from audioBase64', {
            hasBase64: true,
            volume: finalMusicVolume,
            base64Length: backgroundMusicBase64.length,
          })
        } else if (scriptData.backgroundMusic.audioUrl) {
          const audioUrl = scriptData.backgroundMusic.audioUrl
          if (audioUrl.startsWith('data:')) {
            backgroundMusicBase64 = audioUrl.split(',')[1]
            console.log('🎵 Auto-attaching background music from data URL', {
              hasBase64: true,
              volume: finalMusicVolume,
            })
          } else {
            backgroundMusicUrl = audioUrl
            console.log('🎵 Auto-attaching background music from URL', {
              url: audioUrl.substring(0, 50),
              volume: finalMusicVolume,
            })
          }
          finalMusicVolume = scriptData.backgroundMusic.volume ?? musicVolume
        }
      } else {
        console.warn('⚠️ No background music found in scriptData - video will be assembled without background music')
      }

      // Ensure all segments have audio attached automatically if available
      const segmentsWithAutoAudio = approvedSegments.map(segment => {
        // If segment doesn't have audio but video is approved, try to find audio from sentence
        if (!segment.audioUrl && !segment.audioBase64 && scriptData) {
          const sentence = scriptData.sentences.find(s => s.id === segment.sentenceId)
          if (sentence?.audio) {
            // Auto-attach audio even if not explicitly approved (when video is approved)
            const audioUrlOrBase64 = sentence.audio.audioUrl || ''
            
            // Check audioBase64 field first (preferred)
            if (sentence.audio.audioBase64) {
              console.log(`🎵 Auto-attaching audio to segment ${segment.sentenceId} from audioBase64`)
              return {
                ...segment,
                audioBase64: sentence.audio.audioBase64
              }
            }
            
            // Then check audioUrl
            if (audioUrlOrBase64.startsWith('data:')) {
              console.log(`🎵 Auto-attaching audio to segment ${segment.sentenceId} from data URL`)
              return {
                ...segment,
                audioBase64: audioUrlOrBase64.split(',')[1]
              }
            } else if (audioUrlOrBase64) {
              console.log(`🎵 Auto-attaching audio to segment ${segment.sentenceId} from URL`)
              return {
                ...segment,
                audioUrl: audioUrlOrBase64
              }
            }
          } else {
            console.log(`⚠️ Segment ${segment.sentenceId} has approved video but no audio available`)
          }
        } else if (segment.audioUrl || segment.audioBase64) {
          console.log(`✅ Segment ${segment.sentenceId} already has audio attached`)
        }
        return segment
      })

      // Log final assembly request details
      console.log('🎬 Assembling video with:', {
        segmentCount: segmentsWithAutoAudio.length,
        hasBackgroundMusic: !!(backgroundMusicBase64 || backgroundMusicUrl),
        backgroundMusicType: backgroundMusicBase64 ? 'base64' : backgroundMusicUrl ? 'url' : 'none',
        musicVolume: finalMusicVolume,
        aspectRatio,
        segmentsWithAudio: segmentsWithAutoAudio.filter(s => s.audioUrl || s.audioBase64).length,
      })

      const request: AssemblyRequest = {
        segments: segmentsWithAutoAudio,
        aspectRatio,
        musicVolume: finalMusicVolume,
        backgroundMusicBase64,
        backgroundMusicUrl,
      }

      const result = await videoAssemblyService.assembleVideo(request)

      // Revoke old blob URL first
      if (currentBlobUrlRef.current) {
        safeRevokeBlob(currentBlobUrlRef.current)
      }

      // Convert base64 to blob URL
      const videoBlob = base64ToBlob(result.videoBase64, 'video/mp4')
      
      // CRITICAL: Keep blob object in ref to prevent garbage collection
      currentBlobRef.current = videoBlob
      
      const videoUrl = URL.createObjectURL(videoBlob)
      
      // Track for cleanup
      currentBlobUrlRef.current = videoUrl
      
      // Set video element src IMMEDIATELY (synchronously)
      if (videoRef.current) {
        try {
          videoRef.current.src = videoUrl
          videoRef.current.load()
          console.log('✅ Applied assemble blob URL to video element immediately')
        } catch (e) {
          console.error('❌ Failed to apply assemble blob URL:', e)
          // Fallback async
          setTimeout(() => {
            if (videoRef.current && currentBlobUrlRef.current === videoUrl) {
              try {
                videoRef.current.src = videoUrl
                videoRef.current.load()
              } catch (e2) {
                console.error('❌ Async fallback also failed:', e2)
              }
            }
          }, 50)
        }
      }

      const assembledVideoData = {
        videoUrl: '', // NEVER store blob URL in state
        videoBase64: result.videoBase64,
        duration: result.duration,
        exportedAt: undefined,
        isExported: false,
      }

      setAssembledVideo(assembledVideoData)

      // Save assembled video to ScriptData for persistence (NEVER store blob URLs)
      // REMOVED AUTO SAVE - Assembled video is temporary, don't save to DB
      // Final video will be saved only when explicitly exported/approved by user

      toast.success('✅ Video assembled successfully!')
    } catch (error) {
      console.error('Error assembling video:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to assemble video'
      toast.error(errorMessage, { duration: 5000 })
    } finally {
      setIsAssembling(false)
    }
  }, [approvedSegments, scriptData, musicVolume, aspectRatio, isAssembling, isPreviewing, onScriptUpdate, base64ToBlob])

  // Track previous approved count to detect new approvals
  const prevApprovedCountRef = useRef<number>(0)
  
  // Automatic assembly when segments are approved and ready
  // Changed: Auto-assemble when at least 1 approved segment exists (not requiring all)
  useEffect(() => {
    if (!autoAssemble || isAssembling || isPreviewing || !scriptData || approvedSegments.length === 0) {
      return
    }

    const approvedCount = approvedSegments.length
    const prevCount = prevApprovedCountRef.current
    
    // Only auto-assemble if we have new approved segments (count increased)
    // Reset hasAutoAssembled when new videos are approved
    if (approvedCount > prevCount) {
      console.log('🤖 New approved segments detected! Auto-assembling video...', {
        approvedCount,
        prevCount,
        totalSentences: scriptData.sentences?.length || 0
      })
      
      // Reset auto-assembled flag when new videos are approved
      setHasAutoAssembled(false)
      prevApprovedCountRef.current = approvedCount
      
      // Use a timeout to avoid immediate trigger during state updates
      const timeoutId = setTimeout(() => {
        setHasAutoAssembled(true)
        handleAssemble().catch(error => {
          console.error('Auto-assembly failed:', error)
          setHasAutoAssembled(false)
          prevApprovedCountRef.current = prevCount // Revert on error
        })
      }, 1500) // Small delay to ensure state is stable
      
      return () => clearTimeout(timeoutId)
    } else {
      // Update ref even if not assembling
      prevApprovedCountRef.current = approvedCount
    }
  }, [approvedSegments.length, autoAssemble, isAssembling, isPreviewing, scriptData, handleAssemble, hasAutoAssembled])

  const handlePlayPause = () => {
    const videoElement = videoRef.current
    if (!videoElement || !assembledVideo) return
    const videoUrl = getCurrentVideoUrl()
    if (!videoUrl) return

    if (isPlaying) {
      videoElement.pause()
      setIsPlaying(false)
    } else {
      videoElement.play()
      setIsPlaying(true)
    }
  }

  const recreateBlobFromBase64 = (): boolean => {
    // Prevent concurrent blob creation
    if (isCreatingBlobRef.current) {
      console.warn('⚠️ Blob creation already in progress, skipping')
      return false
    }
    
    if (!assembledVideo?.videoBase64) {
      console.warn('⚠️ Cannot recreate blob: no videoBase64')
      return false
    }
    
    isCreatingBlobRef.current = true
    
    try {
      // Validate base64 string
      if (assembledVideo.videoBase64.length < 100) {
        console.error('❌ Base64 too short, likely invalid:', assembledVideo.videoBase64.length)
        isCreatingBlobRef.current = false
        return false
      }
      
      // Validate base64 format
      try {
        atob(assembledVideo.videoBase64.substring(0, 100))
      } catch (e) {
        console.error('❌ Invalid base64 format:', e)
        isCreatingBlobRef.current = false
        return false
      }
      
      // Revoke previous blob URL first (only if different)
      const oldBlobUrl = currentBlobUrlRef.current
      if (oldBlobUrl) {
        // Only revoke if video element is not using it
        if (!videoRef.current || videoRef.current.src !== oldBlobUrl) {
          safeRevokeBlob(oldBlobUrl)
        }
        currentBlobUrlRef.current = null
      }
      
      // Create blob from base64
      const blob = base64ToBlob(assembledVideo.videoBase64, 'video/mp4')
      
      // Validate blob
      if (!blob || blob.size === 0) {
        console.error('❌ Invalid blob created (size = 0)')
        isCreatingBlobRef.current = false
        return false
      }
      
      if (blob.size < 1024) {
        console.warn('⚠️ Blob size suspiciously small:', blob.size, 'bytes')
      }
      
      // CRITICAL: Keep blob object in ref to prevent garbage collection
      currentBlobRef.current = blob
      
      // Create blob URL
      const blobUrl = URL.createObjectURL(blob)
      currentBlobUrlRef.current = blobUrl
      
      console.log('✅ Created blob URL:', {
        blobUrl: blobUrl.substring(0, 50) + '...',
        blobSize: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
        base64Length: assembledVideo.videoBase64.length,
      })
      
      // Apply to video element IMMEDIATELY (synchronously if possible)
      if (videoRef.current) {
        try {
          // Pause video if playing
          if (!videoRef.current.paused) {
            videoRef.current.pause()
          }
          
          // Direct assignment - don't clear first, just set it
          videoRef.current.src = blobUrl
          
          // Force load immediately
          videoRef.current.load()
          
          console.log('✅ Applied blob URL to video element immediately')
          
          // Also verify it stuck
          setTimeout(() => {
            if (videoRef.current) {
              const actualSrc = videoRef.current.src || videoRef.current.currentSrc
              if (actualSrc === blobUrl) {
                console.log('✅ Verified blob URL is set on video element')
              } else {
                console.warn('⚠️ Blob URL mismatch - expected:', blobUrl.substring(0, 50), 'got:', actualSrc.substring(0, 50))
                // Retry setting it
                if (currentBlobUrlRef.current === blobUrl) {
                  videoRef.current.src = blobUrl
                  videoRef.current.load()
                }
              }
            }
          }, 100)
        } catch (e) {
          console.error('❌ Failed to apply blob URL to video element:', e)
          // Fallback: try async
          setTimeout(() => {
            if (videoRef.current && currentBlobUrlRef.current === blobUrl) {
              try {
                videoRef.current.src = blobUrl
                videoRef.current.load()
              } catch (e2) {
                console.error('❌ Async fallback also failed:', e2)
              }
            }
          }, 50)
        }
      }
      
      isCreatingBlobRef.current = false
      
      return true
    } catch (e) {
      console.error('❌ Failed to recreate blob URL from base64:', e)
      currentBlobUrlRef.current = null
      isCreatingBlobRef.current = false
      return false
    }
  }

  // Get current video URL - use blob ref if available, otherwise use state URL
  // IMPORTANT: Don't create blob URLs here - only read existing ones
  // Blob URLs should be created in useEffect or event handlers only
  const getCurrentVideoUrl = (): string => {
    // Return existing blob URL if available
    if (currentBlobUrlRef.current) {
      return currentBlobUrlRef.current
    }
    
    // Return non-blob URL if available (HTTP/HTTPS)
    if (assembledVideo?.videoUrl && !assembledVideo.videoUrl.startsWith('blob:')) {
      return assembledVideo.videoUrl
    }
    
    // Return empty to trigger error handler which will create blob URL
    return ''
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

    if (assembledVideo.isExported) {
      toast.info('Video already exported! Downloading again...')
    }

    // Get current video URL (blob ref or state)
    const videoUrl = getCurrentVideoUrl()
    if (!videoUrl) {
      toast.error('No video source available. Please re-assemble.')
      return
    }

    // Download video
    const link = document.createElement('a')
    link.href = videoUrl
    link.download = `final-video-${Date.now()}.mp4`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Mark as exported and save to ScriptData
    const exportedAt = new Date().toISOString()
    const exportedVideo = {
      ...assembledVideo,
      exportedAt,
      isExported: true,
    }

    setAssembledVideo(exportedVideo)
    setIsApproved(true) // Keep approved state after export

    // REMOVED AUTO SAVE - Export is temporary, don't save to DB automatically
    // User should explicitly approve/save if they want to persist
    // For now, just keep in local state

    // Call onExport callback if provided
    if (onExport) {
      const videoUrl = getCurrentVideoUrl()
      onExport(videoUrl, assembledVideo.videoBase64)
    }

    toast.success('✅ Video exported successfully!')
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get video context for generation
  // Removed unused function getVideoContext

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-5 w-5" />
          Video Editor
        </CardTitle>
        <CardDescription>
          Generate videos and audio, then assemble approved segments into final video
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Brackets grid: one slot per sentence (15 typical) */}
        {scriptData?.sentences && scriptData.sentences.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Brackets ({scriptData.sentences.length})</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {scriptData.sentences.map((s, idx) => {
                const hasMedia = !!(s.visual?.videoUrl || s.visual?.imageUrl)
                const isApproved = !!s.visual?.approved && hasMedia
                return (
                  <div
                    key={s.id}
                    className={`rounded border p-2 text-xs overflow-hidden ${
                      isApproved
                        ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                        : hasMedia
                        ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
                        : 'bg-muted/30'
                    }`}
                    title={s.text}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="px-2">
                        {idx + 1}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {isApproved ? 'Approved' : hasMedia ? 'Generated' : 'Empty'}
                      </span>
                    </div>
                    <div className="truncate">
                      {(s.text || '').slice(0, 60)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Show All Generated Videos (Approved + Unapproved) */}
        {scriptData?.sentences && scriptData.sentences.length > 0 && (() => {
          // Show ALL sentences that have generated videos (approved or not)
          const sentencesWithVideos = scriptData.sentences.filter(
            s => s.visual && (s.visual.videoUrl || s.visual.imageUrl)
          )
          
          const approvedCount = sentencesWithVideos.filter(s => s.visual?.approved).length
          
          if (sentencesWithVideos.length === 0) {
            return (
              <div className="p-8 text-center border rounded-lg bg-muted/50">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Videos Generated Yet</h3>
                <p className="text-sm text-muted-foreground">
                  Please generate videos first. Generated videos will appear here automatically.
                </p>
              </div>
            )
          }
          
          return (
            <div className="space-y-6">
              <div className="border-b pb-4">
                <h3 className="text-lg font-semibold mb-2">
                  Generated Videos ({sentencesWithVideos.length} / {scriptData.sentences.length})
                </h3>
                <p className="text-sm text-muted-foreground">
                  {approvedCount > 0 && (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {approvedCount} approved. 
                    </span>
                  )}
                  All generated videos are shown here. Approve videos to include them in final assembly.
                </p>
              </div>
              
              {sentencesWithVideos.map((sentence) => {
                const originalIndex = scriptData.sentences.findIndex(s => s.id === sentence.id)
                return (
              <div key={sentence.id} className="space-y-4 border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={sentence.visual?.approved ? "default" : "secondary"}>
                        Sentence {originalIndex + 1}
                      </Badge>
                      {sentence.visual?.approved ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          ✅ Approved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          ⏳ Pending Approval
                        </Badge>
                      )}
                      {sentence.audio?.approved && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          🎵 Audio Approved
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{sentence.text}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Video Preview */}
                  <div className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Video className="h-4 w-4" />
                        Video
                      </h4>
                      {sentence.visual?.status && (
                        <Badge variant="outline" className="text-xs">
                          {sentence.visual.status}
                        </Badge>
                      )}
                    </div>
                    {sentence.visual?.videoUrl || sentence.visual?.imageUrl ? (
                      <div className="space-y-3">
                        {/* Media with subtitle overlay (match Show Gallery layout) */}
                        <div className="relative w-full rounded border overflow-hidden">
                          {sentence.visual.videoUrl ? (
                            <video 
                              src={sentence.visual.videoUrl.startsWith('data:') ? (() => { try { const b64 = sentence.visual!.videoUrl!.split(',')[1]; const blob = base64ToBlob(b64, 'video/mp4'); return URL.createObjectURL(blob); } catch { return sentence.visual!.videoUrl!; } })() : sentence.visual.videoUrl} 
                              className="w-full h-full"
                              controls
                            />
                          ) : (
                            <img 
                              src={sentence.visual.imageUrl!}
                              alt="Video thumbnail"
                              className="w-full h-full object-cover"
                            />
                          )}

                          {/* Subtitle overlay preview (non-destructive) */}
                          {sentence.visual.subtitleSettings && sentence.text && (
                            <div
                              className="absolute inset-x-0 pointer-events-none px-4"
                              style={{
                                // If explicit yPosition provided, use it (px from top);
                                // otherwise default to bottom padding similar to gallery
                                top: sentence.visual.subtitleSettings.yPosition !== undefined 
                                  ? `${sentence.visual.subtitleSettings.yPosition}px` 
                                  : undefined,
                                bottom: sentence.visual.subtitleSettings.yPosition === undefined ? '24px' : undefined,
                                transform: 'translateY(0)',
                                textAlign: 'center',
                                color: '#FFFFFF',
                                fontWeight: 'bold',
                                textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                                fontSize: sentence.visual.subtitleSettings.fontSize 
                                  ? `${sentence.visual.subtitleSettings.fontSize}px` 
                                  : '20px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'inline-block',
                                  transform: sentence.visual.subtitleSettings.zoom 
                                    ? `scale(${sentence.visual.subtitleSettings.zoom})` 
                                    : 'none',
                                  transformOrigin: 'center',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(0,0,0,0.25)',
                                }}
                              >
                                {sentence.text}
                              </div>
                            </div>
                          )}
                        </div>

                        {!sentence.visual.approved && (
                          <div className="pt-2 border-t">
                            {onVisualApprove ? (
                            <Button
                              disabled={approvingIds.has(sentence.id)}
                              onClick={async () => {
                                  console.log('🎬 Approving video from editor:', sentence.id)
                                  // Build approved visual and persist through all channels
                                  const currentVisual = sentence.visual || { approved: false, status: 'completed' }
                                  const approvedVisual: SentenceVisual = {
                                    ...currentVisual,
                                    approved: true,
                                    status: 'approved',
                                    // Ensure media fields are preserved so merge can't drop them
                                    videoUrl: currentVisual.videoUrl || sentence.visual?.videoUrl,
                                    imageUrl: currentVisual.imageUrl || sentence.visual?.imageUrl,
                                    thumbnailUrl: currentVisual.thumbnailUrl || sentence.visual?.thumbnailUrl,
                                    transitionType: currentVisual.transitionType || sentence.visual?.transitionType,
                                    subtitleSettings: currentVisual.subtitleSettings || sentence.visual?.subtitleSettings,
                                  } as any

                                  // CRITICAL: Validate sentence.id exists in scriptData before updating
                                  const targetSentence = scriptData?.sentences.find(s => s.id === sentence.id)
                                  if (!targetSentence) {
                                    console.error('❌ VideoTimelineEditor: Sentence not found when approving!', {
                                      sentenceId: sentence.id,
                                      availableIds: scriptData?.sentences.map(s => s.id.substring(0, 8)) || [],
                                    })
                                    toast.error('Error: Sentence not found')
                                    return
                                  }

                                  console.log('🎬 Approving video from editor - VALIDATED:', {
                                    sentenceId: sentence.id,
                                    targetSentenceText: targetSentence.text.substring(0, 50) + '...',
                                    hasVideoUrl: !!approvedVisual.videoUrl,
                                    hasImageUrl: !!approvedVisual.imageUrl,
                                  })

                                  // 1) Update via onVisualUpdate (child → parent merge)
                                  try {
                                    setApprovingIds(prev => new Set(prev).add(sentence.id))
                                    onVisualUpdate?.(sentence.id, approvedVisual)

                                    // REMOVED AUTO SYNC - Only save happens via onVisualApprove callback
                                    // Parent component will handle saving in handleVisualApprove

                                    // 2) Call approval callback - THIS will trigger save
                                    onVisualApprove(sentence.id)
                                  } finally {
                                    setApprovingIds(prev => {
                                      const next = new Set(prev)
                                      next.delete(sentence.id)
                                      return next
                                    })
                                  }
                                }}
                                variant="default"
                                size="default"
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Export to Video Assembly
                              </Button>
                            ) : (
                              <div className="p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
                                ⚠️ Approval handler not available
                              </div>
                            )}
                          </div>
                        )}
                        {sentence.visual.approved && (
                          <div className="pt-2 border-t">
                            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded">
                              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                              <span className="text-xs font-medium text-green-800 dark:text-green-200">
                                ✅ Approved - Ready for Assembly
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No video available</p>
                    )}
                  </div>
                  
                  {/* Audio Preview */}
                  <div className="border rounded-lg p-3">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      Audio
                    </h4>
                    {sentence.audio?.audioUrl ? (
                      <div className="space-y-2">
                        <audio 
                          src={sentence.audio.audioUrl} 
                          controls
                          className="w-full"
                        />
                        {!sentence.audio.approved && (
                          <Button
                            onClick={() => onAudioApprove?.(sentence.id)}
                            variant="default"
                            size="sm"
                            className="w-full mt-2 bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Export to Video Assembly
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No audio available</p>
                    )}
                  </div>
                </div>
              </div>
                )
              })}
            </div>
          )
        })()}

        {/* Divider */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">Timeline & Assembly</h3>
        </div>

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
                const edits = segmentEdits[segment.sentenceId] || {}
                const baseDuration = sentence?.audio?.duration || 6
                const isExpanded = expandedSegments.has(segment.sentenceId)
                
                return (
                  <div 
                    key={segment.sentenceId} 
                    className="text-sm p-3 bg-background rounded border space-y-2"
                  >
                    <div className="flex items-center gap-2">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setExpandedSegments(prev => {
                            const next = new Set(prev)
                            if (next.has(segment.sentenceId)) {
                              next.delete(segment.sentenceId)
                            } else {
                              next.add(segment.sentenceId)
                            }
                            return next
                          })
                        }}
                        className="h-6 px-2"
                      >
                        {isExpanded ? '▼' : '▶'}
                      </Button>
                    </div>
                    
                    {isExpanded && (
                      <div className="pt-2 border-t space-y-3">
                        {/* Crop Controls */}
                        <div>
                          <label className="text-xs font-medium mb-1 block">✂️ Crop Video</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-muted-foreground">Start (s)</label>
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max={baseDuration}
                                value={edits.startTime ?? 0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setSegmentEdits(prev => ({
                                    ...prev,
                                    [segment.sentenceId]: {
                                      ...prev[segment.sentenceId],
                                      startTime: Math.max(0, Math.min(val, baseDuration - 0.1))
                                    }
                                  }))
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">End (s)</label>
                              <Input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max={baseDuration}
                                value={edits.endTime ?? baseDuration}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || baseDuration
                                  setSegmentEdits(prev => ({
                                    ...prev,
                                    [segment.sentenceId]: {
                                      ...prev[segment.sentenceId],
                                      endTime: Math.max((edits.startTime ?? 0) + 0.1, Math.min(val, baseDuration))
                                    }
                                  }))
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Transition Selection */}
                        <div>
                          <label className="text-xs font-medium mb-1 block">🔄 Transition to Next</label>
                          <div className="flex gap-1">
                            {(['fade', 'slide', 'dissolve', 'none'] as const).map((type) => (
                              <Button
                                key={type}
                                variant={edits.transitionType === type || (!edits.transitionType && segment.transitionType === type) ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => {
                                  setSegmentEdits(prev => ({
                                    ...prev,
                                    [segment.sentenceId]: {
                                      ...prev[segment.sentenceId],
                                      transitionType: type
                                    }
                                  }))
                                }}
                                className="h-7 text-xs capitalize flex-1"
                              >
                                {type}
                              </Button>
                            ))}
                          </div>
                        </div>
                        
                        {/* Subtitle Controls */}
                        {sentence?.visual?.subtitleSettings && (
                          <div>
                            <label className="text-xs font-medium mb-1 block">📝 Subtitle Settings</label>
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-muted-foreground">Size: {edits.subtitleSize ?? sentence.visual.subtitleSettings.fontSize}px</label>
                                <input
                                  type="range"
                                  min="12"
                                  max="72"
                                  value={edits.subtitleSize ?? sentence.visual.subtitleSettings.fontSize}
                                  onChange={(e) => {
                                    setSegmentEdits(prev => ({
                                      ...prev,
                                      [segment.sentenceId]: {
                                        ...prev[segment.sentenceId],
                                        subtitleSize: parseInt(e.target.value)
                                      }
                                    }))
                                  }}
                                  className="w-full h-2"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Position: {edits.subtitlePosition ?? sentence.visual.subtitleSettings.yPosition}px</label>
                                <input
                                  type="range"
                                  min="100"
                                  max="980"
                                  value={edits.subtitlePosition ?? sentence.visual.subtitleSettings.yPosition}
                                  onChange={(e) => {
                                    setSegmentEdits(prev => ({
                                      ...prev,
                                      [segment.sentenceId]: {
                                        ...prev[segment.sentenceId],
                                        subtitlePosition: parseInt(e.target.value)
                                      }
                                    }))
                                  }}
                                  className="w-full h-2"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Settings */}
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="video">Video</TabsTrigger>
            <TabsTrigger value="text">Text Overlay</TabsTrigger>
            <TabsTrigger value="auto">Auto</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4">
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
                onChange={(e) => {
                  const value = parseInt(e.target.value) / 100;
                  // Clamp between 0 and 1
                  const clampedValue = Math.max(0, Math.min(1, value));
                  setMusicVolume(clampedValue);
                  console.log('🎵 Background music volume changed:', {
                    percentage: Math.round(clampedValue * 100),
                    value: clampedValue,
                  });
                }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Adjust background music volume (0% - 100%)
              </p>
            </div>
          </TabsContent>

          <TabsContent value="video" className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                <ImageIcon className="h-4 w-4 inline mr-2" />
                Brightness: {brightness}%
              </label>
              <input
                type="range"
                min="0"
                max="200"
                value={brightness}
                onChange={(e) => setBrightness(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                <ImageIcon className="h-4 w-4 inline mr-2" />
                Contrast: {contrast}%
              </label>
              <input
                type="range"
                min="0"
                max="200"
                value={contrast}
                onChange={(e) => setContrast(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                <Sparkles className="h-4 w-4 inline mr-2" />
                Saturation: {saturation}%
              </label>
              <input
                type="range"
                min="0"
                max="200"
                value={saturation}
                onChange={(e) => setSaturation(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                <Zap className="h-4 w-4 inline mr-2" />
                Video Filter
              </label>
              <select
                value={videoFilter}
                onChange={(e) => setVideoFilter(e.target.value)}
                className="w-full p-2 border rounded-lg"
              >
                <option value="none">None</option>
                <option value="sepia">Sepia</option>
                <option value="grayscale">Grayscale</option>
                <option value="vintage">Vintage</option>
                <option value="cool">Cool Tone</option>
                <option value="warm">Warm Tone</option>
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBrightness(100)
                setContrast(100)
                setSaturation(100)
                setVideoFilter('none')
                toast.success('Video filters reset')
              }}
              className="w-full"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          </TabsContent>

          <TabsContent value="text" className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                <Type className="h-4 w-4 inline mr-2" />
                Text Overlay
              </label>
              <Input
                type="text"
                placeholder="Enter text to overlay on video..."
                value={textOverlay}
                onChange={(e) => setTextOverlay(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional: Add text overlay to the video
              </p>
            </div>

            {textOverlay && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Text Position
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant={textPosition === 'top' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTextPosition('top')}
                      className="flex-1"
                    >
                      Top
                    </Button>
                    <Button
                      variant={textPosition === 'center' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTextPosition('center')}
                      className="flex-1"
                    >
                      Center
                    </Button>
                    <Button
                      variant={textPosition === 'bottom' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTextPosition('bottom')}
                      className="flex-1"
                    >
                      Bottom
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Text Size: {textSize}px
                  </label>
                  <input
                    type="range"
                    min="12"
                    max="72"
                    value={textSize}
                    onChange={(e) => setTextSize(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Text Color
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-16 h-10 rounded border"
                    />
                    <Input
                      type="text"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="flex-1"
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="auto" className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Auto-Assemble Video
                </label>
                <Button
                  variant={autoAssemble ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setAutoAssemble(!autoAssemble)
                    setHasAutoAssembled(false)
                    toast.info(`Auto-assemble ${!autoAssemble ? 'enabled' : 'disabled'}`)
                  }}
                >
                  {autoAssemble ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                When enabled, video will automatically assemble when all segments are approved.
                Audio and background music will be automatically attached.
              </p>
              {hasAutoAssembled && (
                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-800 dark:text-green-200">
                    Auto-assembly completed
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Automatic Features:</h4>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>✅ Video segments automatically attached</li>
                <li>✅ Audio narration automatically attached</li>
                <li>✅ Background music automatically attached</li>
                <li>✅ Transitions automatically applied</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>

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
          key={`video-${assembledVideo.videoBase64 ? assembledVideo.videoBase64.substring(0, 30) : 'no-video'}-${currentBlobUrlRef.current ? 'has-blob' : 'no-blob'}`}
          src={getCurrentVideoUrl() || undefined}
          className="w-full h-full"
          controls
          playsInline
          preload="metadata"
          poster={posterUrl}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onLoadedMetadata={() => {
                  // Ensure UI reflects metadata duration
                  if (assembledVideo && videoRef.current?.duration) {
                    if (!assembledVideo.duration || Math.abs(assembledVideo.duration - videoRef.current.duration) > 0.25) {
                      setAssembledVideo(prev => prev ? { ...prev, duration: videoRef.current!.duration } : prev)
                    }
                  }
                }}
                onError={(e) => {
                  const error = e.currentTarget.error
                  const currentSrc = videoRef.current?.currentSrc || videoRef.current?.src || ''
                  
                  console.error('⚠️ Video element error:', {
                    code: error?.code,
                    message: error?.message,
                    errorType: error?.code === 4 ? 'FORMAT_ERROR' : 'UNKNOWN',
                    currentSrc: currentSrc.substring(0, 60),
                    hasBase64: !!assembledVideo?.videoBase64,
                    hasBlobUrl: !!currentBlobUrlRef.current,
                    blobUrlMatches: currentSrc === currentBlobUrlRef.current,
                  })
                  
                  // If error code 4 (FORMAT_ERROR), the blob might be corrupted
                  // Always try to recreate from base64 if we have it
                  if (assembledVideo?.videoBase64) {
                    console.log('🔄 onError: Attempting to recreate blob URL from base64...')
                    
                    // Wait a bit before recreating to avoid rapid retries
                    setTimeout(() => {
                      const ok = recreateBlobFromBase64()
                      if (!ok) {
                        toast.error('Failed to load video. The video data may be corrupted. Please re-assemble.')
                      } else {
                        console.log('✅ Blob URL recreated, video should reload automatically')
                      }
                    }, 200)
                  } else {
                    toast.error('No video data available. Please re-assemble.')
                  }
                }}
                style={{
                  filter: `
                    brightness(${brightness}%) 
                    contrast(${contrast}%) 
                    saturate(${saturation}%)
                    ${videoFilter === 'sepia' ? 'sepia(100%)' : ''}
                    ${videoFilter === 'grayscale' ? 'grayscale(100%)' : ''}
                    ${videoFilter === 'vintage' ? 'sepia(50%) contrast(120%) brightness(90%)' : ''}
                    ${videoFilter === 'cool' ? 'hue-rotate(180deg) saturate(120%)' : ''}
                    ${videoFilter === 'warm' ? 'sepia(30%) saturate(130%) brightness(110%)' : ''}
                  `.trim(),
          }}
        >
          {getCurrentVideoUrl() ? (
            <source src={getCurrentVideoUrl()} type="video/mp4" />
          ) : null}
        </video>
              {/* Text Overlay */}
              {textOverlay && (
                <div
                  className="absolute inset-x-0 px-4 pointer-events-none"
                  style={{
                    [textPosition === 'top' ? 'top' : textPosition === 'bottom' ? 'bottom' : 'top']: textPosition === 'center' ? '50%' : '20px',
                    transform: textPosition === 'center' ? 'translateY(-50%)' : 'none',
                    color: textColor,
                    fontSize: `${textSize}px`,
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    fontWeight: 'bold',
                    textAlign: 'center' as const,
                  }}
                >
                  {textOverlay}
                </div>
              )}
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
                    {assembledVideo.isExported 
                      ? '✅ Video Exported Successfully!' 
                      : 'Video Approved - Ready for Export'}
                  </span>
                </div>
                {assembledVideo.exportedAt && (
                  <p className="text-xs text-muted-foreground text-center">
                    Exported: {new Date(assembledVideo.exportedAt).toLocaleString()}
                  </p>
                )}
                <Button
                  onClick={handleExport}
                  className="w-full"
                  size="lg"
                  variant={assembledVideo.isExported ? "outline" : "default"}
                  disabled={assembledVideo.isExported}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {assembledVideo.isExported ? '✅ Already Exported' : 'Export Final Video'}
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

