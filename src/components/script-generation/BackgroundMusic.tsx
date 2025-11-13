import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Music, 
  Upload, 
  Play, 
  Pause, 
  Volume2, 
  Scissors, 
  CheckCircle, 
  XCircle,
  Loader2,
  Info
} from 'lucide-react'
import { toast } from 'sonner'
import { stableAudioService } from '@/services/stableAudioService'
import { BackgroundMusic } from '@/services/geminiService'

interface BackgroundMusicProps {
  backgroundMusic?: BackgroundMusic
  onUpdate: (music: BackgroundMusic | null) => void
  totalDuration?: number // Total duration of all sentences in seconds
}

export function BackgroundMusicComponent({
  backgroundMusic,
  onUpdate,
  totalDuration = 90
}: BackgroundMusicProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isTrimming, setIsTrimming] = useState(false)
  const [isAdjustingVolume, setIsAdjustingVolume] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(Math.min(95, Math.max(30, totalDuration)))
  const [volume, setVolume] = useState(backgroundMusic?.volume ?? 0.3)
  const [trimStart, setTrimStart] = useState(backgroundMusic?.trimStart ?? 0)
  const [trimEnd, setTrimEnd] = useState(backgroundMusic?.trimEnd ?? backgroundMusic?.duration ?? duration)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize audio element
  useEffect(() => {
    // Clean up previous audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (backgroundMusic?.audioUrl) {
      const audio = new Audio(backgroundMusic.audioUrl)
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime)
      })
      audio.addEventListener('ended', () => {
        setIsPlaying(false)
        setCurrentTime(0)
      })
      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e)
        toast.error('Failed to play audio')
        setIsPlaying(false)
      })
      audioRef.current = audio
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [backgroundMusic?.audioUrl])

  // Update volume when backgroundMusic changes
  useEffect(() => {
    if (backgroundMusic) {
      setVolume(backgroundMusic.volume ?? 0.3)
      setTrimStart(backgroundMusic.trimStart ?? 0)
      setTrimEnd(backgroundMusic.trimEnd ?? backgroundMusic.duration ?? duration)
    }
  }, [backgroundMusic, duration])

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt for the background music')
      return
    }

    setIsGenerating(true)
    try {
      const result = await stableAudioService.generateBackgroundMusic({
        prompt: prompt.trim(),
        duration: Math.min(95, Math.max(30, duration)),
      })

      const newMusic: BackgroundMusic = {
        ...result,
        approved: false,
        volume: 0.3,
      }

      onUpdate(newMusic)
      toast.success('Background music generated successfully!')
    } catch (error: any) {
      console.error('Background music generation error:', error)
      const errorMessage = error.message || 'Failed to generate background music'
      
      // Show helpful error with suggestion to use upload
      toast.error(
        errorMessage + ' You can upload your own music file using the Upload button instead.',
        { duration: 8000 }
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('audio/')) {
      toast.error('Please select an audio file')
      return
    }

    setIsUploading(true)
    try {
      const result = await stableAudioService.uploadBackgroundMusic(file)

      const newMusic: BackgroundMusic = {
        ...result,
        approved: false,
        volume: 0.3,
      }

      onUpdate(newMusic)
      toast.success('Background music uploaded successfully!')
    } catch (error: any) {
      console.error('Background music upload error:', error)
      toast.error(error.message || 'Failed to upload background music')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleTrim = async () => {
    if (!backgroundMusic?.audioBase64) {
      toast.error('No background music to trim')
      return
    }

    if (trimStart >= trimEnd) {
      toast.error('Start time must be less than end time')
      return
    }

    setIsTrimming(true)
    try {
      const result = await stableAudioService.trimBackgroundMusic({
        audioBase64: backgroundMusic.audioBase64,
        startTime: trimStart,
        endTime: trimEnd,
      })

      const newMusic: BackgroundMusic = {
        ...backgroundMusic,
        audioBase64: result.audioBase64,
        audioUrl: `data:audio/mpeg;base64,${result.audioBase64}`,
        duration: result.duration,
        trimStart,
        trimEnd,
      }

      onUpdate(newMusic)
      toast.success('Background music trimmed successfully!')
    } catch (error: any) {
      console.error('Background music trim error:', error)
      toast.error(error.message || 'Failed to trim background music')
    } finally {
      setIsTrimming(false)
    }
  }

  const handleAdjustVolume = async () => {
    if (!backgroundMusic?.audioBase64) {
      toast.error('No background music to adjust volume')
      return
    }

    setIsAdjustingVolume(true)
    try {
      const result = await stableAudioService.adjustVolume({
        audioBase64: backgroundMusic.audioBase64,
        volume,
      })

      const newMusic: BackgroundMusic = {
        ...backgroundMusic,
        audioBase64: result.audioBase64,
        audioUrl: `data:audio/mpeg;base64,${result.audioBase64}`,
        volume: result.volume,
      }

      onUpdate(newMusic)
      toast.success('Background music volume adjusted successfully!')
    } catch (error: any) {
      console.error('Background music volume adjustment error:', error)
      toast.error(error.message || 'Failed to adjust background music volume')
    } finally {
      setIsAdjustingVolume(false)
    }
  }

  const handleApprove = () => {
    if (!backgroundMusic) return

    const approvedMusic: BackgroundMusic = {
      ...backgroundMusic,
      approved: true,
      volume,
      trimStart,
      trimEnd,
    }

    onUpdate(approvedMusic)
    toast.success('Background music approved!')
  }

  const handleReject = () => {
    onUpdate(null)
    toast.info('Background music rejected')
  }

  const togglePlayback = async () => {
    if (!audioRef.current || !backgroundMusic?.audioUrl) {
      toast.error('No audio available to play')
      return
    }

    try {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        await audioRef.current.play()
        setIsPlaying(true)
      }
    } catch (error: any) {
      console.error('Playback error:', error)
      toast.error('Failed to play audio: ' + (error.message || 'Unknown error'))
      setIsPlaying(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Background Music
        </CardTitle>
        <CardDescription>
          Generate or upload background music for your entire script. One track will be used consistently across all sentences.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!backgroundMusic ? (
          // Generate or Upload Section
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>💡 Tip:</strong> If AI generation doesn't work, you can upload your own background music file (MP3, WAV, M4A, OGG) using the Upload button below.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="prompt">Music Prompt (Optional - requires Stable Audio API access)</Label>
              <Input
                id="prompt"
                placeholder="e.g., calm ambient background music, upbeat corporate music, cinematic orchestral"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
              />
              <p className="text-sm text-muted-foreground">
                Describe the style and mood of the background music you want. <strong>Note:</strong> This requires a Stability AI API key with Stable Audio access.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (seconds)</Label>
              <Input
                id="duration"
                type="number"
                min={30}
                max={95}
                value={duration}
                onChange={(e) => setDuration(Math.min(95, Math.max(30, parseInt(e.target.value) || 30)))}
                disabled={isGenerating}
              />
              <p className="text-sm text-muted-foreground">
                Recommended: {totalDuration} seconds (matches script duration)
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="default"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Music (Recommended)
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="flex-1"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Music className="mr-2 h-4 w-4" />
                    Generate (AI)
                  </>
                )}
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
        ) : (
          // Music Controls Section
          <div className="space-y-4">
            {/* Playback Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePlayback}
                    disabled={!backgroundMusic.audioUrl}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {formatTime(currentTime)} / {formatTime(backgroundMusic.duration ?? 0)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {backgroundMusic.approved ? (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Approved
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pending Approval</Badge>
                  )}
                </div>
              </div>

              {backgroundMusic.prompt && (
                <p className="text-sm text-muted-foreground">
                  <strong>Prompt:</strong> {backgroundMusic.prompt}
                </p>
              )}

              {backgroundMusic.license && (
                <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="text-xs text-muted-foreground">
                    <p><strong>License:</strong> {backgroundMusic.license.licenseType}</p>
                    {backgroundMusic.license.attribution && (
                      <p><strong>Attribution:</strong> {backgroundMusic.license.attribution}</p>
                    )}
                    {backgroundMusic.license.usageRights && (
                      <p><strong>Usage:</strong> {backgroundMusic.license.usageRights}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Volume Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="volume" className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Volume: {Math.round(volume * 100)}%
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAdjustVolume}
                  disabled={isAdjustingVolume || volume === backgroundMusic.volume}
                >
                  {isAdjustingVolume ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Apply'
                  )}
                </Button>
              </div>
              <Input
                id="volume"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                disabled={isAdjustingVolume}
              />
            </div>

            <Separator />

            {/* Trim Controls */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Scissors className="h-4 w-4" />
                Trim Music
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="trimStart" className="text-xs">Start (seconds)</Label>
                  <Input
                    id="trimStart"
                    type="number"
                    min="0"
                    max={backgroundMusic.duration}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Math.max(0, Math.min(parseFloat(e.target.value) || 0, trimEnd)))}
                    disabled={isTrimming}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="trimEnd" className="text-xs">End (seconds)</Label>
                  <Input
                    id="trimEnd"
                    type="number"
                    min={trimStart}
                    max={backgroundMusic.duration}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Math.min(backgroundMusic.duration ?? duration, Math.max(parseFloat(e.target.value) || duration, trimStart)))}
                    disabled={isTrimming}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTrim}
                disabled={isTrimming || trimStart >= trimEnd}
                className="w-full"
              >
                {isTrimming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Trimming...
                  </>
                ) : (
                  <>
                    <Scissors className="mr-2 h-4 w-4" />
                    Trim Music
                  </>
                )}
              </Button>
            </div>

            <Separator />

            {/* Approval Controls */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReject}
                className="flex-1"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                className="flex-1"
                disabled={backgroundMusic.approved}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {backgroundMusic.approved ? 'Approved' : 'Approve'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

