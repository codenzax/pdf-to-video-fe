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
  Pause,
  Loader2,
  AlertCircle,
  Volume2,
  Mic,
} from 'lucide-react'
import { toast } from 'sonner'
import { elevenLabsService, Voice } from '@/services/elevenLabsService'
import { Sentence, SentenceAudio } from '@/services/geminiService'

interface AudioGalleryProps {
  sentence: Sentence
  onApprove: (sentenceId: string) => void
  onReject: (sentenceId: string) => void
  onAudioUpdate: (sentenceId: string, audio: SentenceAudio) => void
}

export function AudioGallery({
  sentence,
  onApprove,
  onReject,
  onAudioUpdate,
}: AudioGalleryProps) {
  const [audio, setAudio] = useState<SentenceAudio | undefined>(sentence.audio)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Popular ElevenLabs voices as fallback
  const defaultVoices: Voice[] = [
    { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'Professional Female', description: 'Clear, professional female voice' },
    { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', category: 'Professional Female', description: 'Strong, confident female voice' },
    { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', category: 'Professional Female', description: 'Warm, friendly female voice' },
    { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'Professional Male', description: 'Deep, clear male voice' },
    { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', category: 'Professional Female', description: 'Young, energetic female voice' },
    { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', category: 'Professional Male', description: 'Deep, authoritative male voice' },
    { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', category: 'Professional Male', description: 'Strong, confident male voice' },
    { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'Professional Male', description: 'Clear, professional male voice' },
    { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', category: 'Professional Male', description: 'Friendly, conversational male voice' },
  ]

  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('21m00Tcm4TlvDq8ikWAM') // Default: Rachel
  const [voices, setVoices] = useState<Voice[]>(defaultVoices) // Start with default voices
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize audio state if not present
  // REMOVED: Auto-initialize audio - only update when user actually does something
  // This prevents unnecessary database saves on every render
  useEffect(() => {
    if (!audio) {
      const newAudio: SentenceAudio = {
        approved: false,
        isCustom: false,
        status: 'pending',
      }
      setAudio(newAudio)
      // DON'T call onAudioUpdate here - only call when user generates/approves audio
    }
  }, [sentence.id, audio])

  // Load available voices on mount
  useEffect(() => {
    loadVoices()
  }, [])

  // Audio playback controls
  useEffect(() => {
    const audioElement = audioRef.current
    if (!audioElement) return

    const updateTime = () => setCurrentTime(audioElement.currentTime)
    const updateDuration = () => setDuration(audioElement.duration || 0)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audioElement.addEventListener('timeupdate', updateTime)
    audioElement.addEventListener('loadedmetadata', updateDuration)
    audioElement.addEventListener('ended', handleEnded)

    return () => {
      audioElement.removeEventListener('timeupdate', updateTime)
      audioElement.removeEventListener('loadedmetadata', updateDuration)
      audioElement.removeEventListener('ended', handleEnded)
    }
  }, [audio?.audioUrl])

  const loadVoices = async () => {
    try {
      setIsLoadingVoices(true)
      const availableVoices = await elevenLabsService.getVoices()
      
      // If API returns voices, use them; otherwise keep default voices
      // API may return empty array if permission missing, but voice generation still works
      if (availableVoices && availableVoices.length > 0) {
        setVoices(availableVoices)
        
        // Set default voice if available
        const defaultVoice = availableVoices.find(v => v.voice_id === selectedVoiceId)
        if (!defaultVoice && availableVoices.length > 0) {
          setSelectedVoiceId(availableVoices[0].voice_id)
        }
      } else {
        // Keep default voices if API returns empty
        console.warn('API returned no voices, using default voices')
        setVoices(defaultVoices)
      }
    } catch (error) {
      console.error('Failed to load voices from API:', error)
      // Use default voices on error - user can still generate audio
      const errorMessage = error instanceof Error ? error.message : 'Failed to load voices'
      console.warn('Using default voices. API Error:', errorMessage)
      
      // Always ensure we have voices available
      setVoices(defaultVoices)
    } finally {
      setIsLoadingVoices(false)
    }
  }

  const handleGenerate = async () => {
    // Use subtitleText if available (synchronized with video), otherwise use sentence.text
    const audioText = sentence.visual?.subtitleText || sentence.text;
    if (!audioText) {
      toast.error('No text available for audio generation')
      return
    }

    setIsGenerating(true)
    setErrorMessage(null) // Clear previous error
    setAudio((prev) =>
      prev ? { ...prev, status: 'generating' } : { status: 'generating', approved: false, isCustom: false }
    )

    try {
      const result = await elevenLabsService.generateAudio({
        text: audioText, // Use synchronized subtitle text if available
        sentenceId: sentence.id,
        voiceId: selectedVoiceId,
      })

      const newAudio: SentenceAudio = {
        audioUrl: result.audioUrl,
        audioBase64: result.audioBase64,
        duration: result.duration,
        approved: false,
        isCustom: false,
        voiceId: selectedVoiceId,
        status: 'completed',
      }

      setAudio(newAudio)
      setErrorMessage(null) // Clear any previous errors
      onAudioUpdate(sentence.id, newAudio)
      toast.success('Audio generated successfully!')
    } catch (error) {
      console.error('Error generating audio:', error)
      const errorMsg = error instanceof Error ? error.message : 'Failed to generate audio'
      setErrorMessage(errorMsg)
      toast.error(errorMsg, { duration: 8000 })
      
      setAudio((prev) =>
        prev
          ? { ...prev, status: 'failed' }
          : { status: 'failed', approved: false, isCustom: false }
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/ogg']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload MP3, WAV, M4A, or OGG files.')
      return
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB')
      return
    }

    setIsGenerating(true)
    setAudio((prev) =>
      prev ? { ...prev, status: 'generating' } : { status: 'generating', approved: false, isCustom: false }
    )

    try {
      const result = await elevenLabsService.uploadAudio(sentence.id, file)

      const newAudio: SentenceAudio = {
        audioUrl: result.audioUrl,
        audioBase64: result.audioBase64,
        duration: result.duration,
        approved: false,
        isCustom: true,
        status: 'completed',
      }

      setAudio(newAudio)
      setErrorMessage(null) // Clear any previous errors
      onAudioUpdate(sentence.id, newAudio)
      toast.success('Audio uploaded successfully!')
    } catch (error) {
      console.error('Error uploading audio:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload audio'
      toast.error(errorMessage, { duration: 5000 })
      
      setAudio((prev) =>
        prev
          ? { ...prev, status: 'failed' }
          : { status: 'failed', approved: false, isCustom: false }
      )
    } finally {
      setIsGenerating(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handlePlayPause = () => {
    const audioElement = audioRef.current
    if (!audioElement || !audio?.audioUrl) return

    if (isPlaying) {
      audioElement.pause()
      setIsPlaying(false)
    } else {
      audioElement.play()
      setIsPlaying(true)
    }
  }

  const handleApprove = () => {
    if (!audio || audio.status !== 'completed') {
      toast.error('Please generate or upload audio first')
      return
    }

    const approvedAudio: SentenceAudio = {
      ...audio,
      approved: true,
      status: 'approved',
    }

    setAudio(approvedAudio)
    onAudioUpdate(sentence.id, approvedAudio)
    onApprove(sentence.id)
    toast.success('✅ Audio exported to Video Assembly!')
  }

  const handleReject = () => {
    const rejectedAudio: SentenceAudio = {
      ...audio!,
      approved: false,
      status: 'rejected',
    }

    setAudio(rejectedAudio)
    onAudioUpdate(sentence.id, rejectedAudio)
    onReject(sentence.id)
    toast.info('Audio rejected')
  }

  const handleRegenerate = () => {
    setAudio((prev) =>
      prev
        ? { ...prev, approved: false, status: 'pending' }
        : { approved: false, isCustom: false, status: 'pending' }
    )
    handleGenerate()
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusBadge = () => {
    if (!audio) return null

    const statusConfig = {
      pending: { label: 'Pending', variant: 'secondary' as const },
      generating: { label: 'Generating...', variant: 'default' as const },
      completed: { label: 'Ready', variant: 'default' as const },
      failed: { label: 'Failed', variant: 'destructive' as const },
      approved: { label: 'Approved', variant: 'default' as const },
      rejected: { label: 'Rejected', variant: 'secondary' as const },
    }

    const config = statusConfig[audio.status] || statusConfig.pending

    return (
      <Badge variant={config.variant} className="ml-2">
        {config.label}
      </Badge>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Audio Narration
            {getStatusBadge()}
          </CardTitle>
          {audio?.isCustom && (
            <Badge variant="outline" className="text-xs">
              Custom Upload
            </Badge>
          )}
        </div>
        <CardDescription>
          Generate or upload audio narration for this sentence
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sentence Text */}
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">{sentence.text}</p>
        </div>

        {/* Voice Selection (only show if generating, not if custom upload) */}
        {!audio?.isCustom && (
          <div>
            <label className="text-sm font-medium mb-2 block">
              Voice Selection {voices.length > 0 && `(${voices.length} available)`}
            </label>
            {isLoadingVoices ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading voices from ElevenLabs...
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedVoiceId}
                  onChange={(e) => setSelectedVoiceId(e.target.value)}
                  className="w-full p-2 border rounded-md bg-background"
                  disabled={isGenerating}
                >
                  {voices.map((voice) => (
                    <option key={voice.voice_id} value={voice.voice_id}>
                      {voice.name} {voice.category && `(${voice.category})`}
                      {voice.description && ` - ${voice.description}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Audio Player */}
        {audio?.audioUrl && audio.status === 'completed' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlayPause}
                disabled={!audio.audioUrl}
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
                  <span>{formatTime(duration)}</span>
                </div>
                <Progress
                  value={duration > 0 ? (currentTime / duration) * 100 : 0}
                  className="h-2"
                />
              </div>
            </div>
            <audio
              ref={audioRef}
              src={audio.audioUrl}
              onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
            />
            {audio.duration && (
              <p className="text-xs text-muted-foreground">
                Duration: {formatTime(audio.duration)}
              </p>
            )}
          </div>
        )}

        {/* Generation Progress */}
        {isGenerating && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">
                {audio?.isCustom ? 'Processing uploaded audio...' : 'Generating audio...'}
              </span>
            </div>
            <Progress value={undefined} className="h-2" />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {!audio?.audioUrl || audio.status === 'failed' ? (
            <>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !sentence.text}
                className="flex-1"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    Generate Audio
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleUpload}
                className="hidden"
              />
            </>
          ) : (
            <>
              {!audio.approved ? (
                <>
                  <Button
                    onClick={handleApprove}
                    disabled={audio.status !== 'completed'}
                    className="flex-1 min-w-[180px]"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Export to Video Assembly
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleReject}
                    disabled={audio.status !== 'completed'}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                    className="flex-1"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                  <Badge variant="default" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Approved
                  </Badge>
                </>
              )}
            </>
          )}
        </div>

        {/* Error Message */}
        {audio?.status === 'failed' && errorMessage && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive mb-1">
                Audio generation failed
              </p>
              <p className="text-sm text-destructive/90">
                {errorMessage}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

