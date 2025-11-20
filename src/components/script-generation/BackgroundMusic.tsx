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
  scriptContent?: string // Script text for context-aware prompt generation
}

export function BackgroundMusicComponent({
  backgroundMusic,
  onUpdate,
  totalDuration = 90,
  scriptContent
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
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Preset music styles
  const presetStyles = [
    {
      id: 'academic',
      name: 'Academic General',
      prompt: 'Ambient, minimal, non-distracting background music. No vocals, no drums, no sudden transitions. Smooth atmospheric pads, warm drones, soft synth textures. Stable energy suitable for narration and research explanations. Scientific, analytical, and neutral tone. 3-5 minute seamless background score with clean atmospheric textures and subtle pulses.'
    },
    {
      id: 'technical',
      name: 'Technical/Engineering',
      prompt: 'Futuristic digital ambient synths. Electronic ambient textures, subtle digital pads, minimal synthesized sounds. Tech-forward atmosphere with clean digital ambience. Ambient, minimal, non-distracting. No vocals, no drums, no sudden transitions. Stable energy suitable for technical narration and research explanations. 3-5 minute seamless background score.'
    },
    {
      id: 'scientific',
      name: 'Scientific/Analytical',
      prompt: 'Clean atmospheric textures and subtle pulses. Atmospheric pads, soft synth textures, gentle harmonic movement. Analytical and precise atmosphere. Ambient, minimal, non-distracting. No vocals, no drums, no sudden transitions. Stable energy suitable for data presentation and research explanations. Scientific, analytical, and neutral tone. 3-5 minute seamless background score.'
    },
    {
      id: 'psychology',
      name: 'Psychology/Social Science',
      prompt: 'Warm soft ambient pads. Warm atmospheric pads, soft harmonic textures, gentle ambient layers. Warm and empathetic atmosphere. Ambient, minimal, non-distracting. No vocals, no drums, no sudden transitions. Stable energy suitable for human-centered research narration. Professional and neutral tone. 3-5 minute seamless background score.'
    },
    {
      id: 'theoretical',
      name: 'Theoretical/Philosophical',
      prompt: 'Deep drones and minimal harmonic movement. Deep atmospheric drones, minimal harmonic textures, subtle tonal shifts. Contemplative and philosophical atmosphere. Ambient, minimal, non-distracting. No vocals, no drums, no sudden transitions. Stable energy suitable for abstract and conceptual explanations. Neutral and contemplative tone. 3-5 minute seamless background score.'
    },
    {
      id: 'medical',
      name: 'Medical/Health',
      prompt: 'Calm atmospheric textures. Gentle atmospheric pads, soft harmonic layers, calming ambient textures. Reassuring and professional medical atmosphere. Ambient, minimal, non-distracting. No vocals, no drums, no sudden transitions. Stable energy suitable for medical and health-related narration. Professional, reassuring, and neutral tone. 3-5 minute seamless background score.'
    },
    {
      id: 'biological',
      name: 'Biological/Life Sciences',
      prompt: 'Organic ambient textures. Warm ambient pads, natural-sounding textures, gentle atmospheric layers. Natural and exploratory scientific atmosphere. Ambient, minimal, non-distracting. No vocals, no drums, no sudden transitions. Stable energy suitable for biological and life science narration. Scientific, natural, and neutral tone. 3-5 minute seamless background score.'
    },
    {
      id: 'physics',
      name: 'Physics/Mathematics',
      prompt: 'Precise atmospheric textures with subtle rhythmic pulses. Minimalist ambient textures, subtle harmonic progressions, clean synth pads. Precise and structured analytical atmosphere. Ambient, minimal, non-distracting. No vocals, no drums. Very subtle gentle rhythmic pulses to support data presentation. Stable energy suitable for mathematical and physics explanations. Analytical and precise tone. 3-5 minute seamless background score.'
    }
  ]

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
        volume: 0.15, // Default to 15% volume
      }

      onUpdate(newMusic)
      toast.success('✅ Background music generated successfully!')
    } catch (error: any) {
      console.error('Background music generation error:', error)
      const errorMessage = error.message || 'Failed to generate background music'
      
      // Show helpful error with suggestion to use upload
      toast.error(
        errorMessage + (errorMessage.includes('upload') ? '' : ' You can upload your own music file using the Upload button instead.'),
        { duration: 10000 }
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

  // Generate intelligent prompt based on script content using advanced analysis
  const generateIntelligentPrompt = () => {
    // Default excellent prompt for research/academic videos
    const defaultPrompt = "Ambient, minimal, non-distracting background music. No vocals, no drums, no sudden transitions. Smooth atmospheric pads, warm drones, soft synth textures. Stable energy suitable for narration and research explanations. Scientific, analytical, and neutral tone. 3-5 minute seamless background score with clean atmospheric textures and subtle pulses."

    if (!scriptContent || scriptContent.trim().length === 0) {
      return defaultPrompt
    }

    // Analyze script content to determine appropriate music style
    const scriptLower = scriptContent.toLowerCase()
    const scriptWords = scriptContent.split(/\s+/).length
    const complexity = scriptWords > 500 ? 'high' : scriptWords > 200 ? 'medium' : 'low'
    
    // Detect topic/mood from keywords
    let musicStyle = ""
    let instruments = ""
    let additionalNotes = ""
    
    // Technical or Engineering
    if (scriptLower.includes('algorithm') || scriptLower.includes('code') || scriptLower.includes('software') || 
        scriptLower.includes('engineering') || scriptLower.includes('technology') || scriptLower.includes('digital') ||
        scriptLower.includes('neural network') || scriptLower.includes('machine learning') || scriptLower.includes('ai') ||
        scriptLower.includes('computer') || scriptLower.includes('programming')) {
      musicStyle = "futuristic digital ambient synths"
      instruments = "electronic ambient textures, subtle digital pads, minimal synthesized sounds"
      additionalNotes = "tech-forward atmosphere with clean digital ambience"
    }
    // Scientific or Analytical
    else if (scriptLower.includes('methodology') || scriptLower.includes('analysis') || scriptLower.includes('data') ||
             scriptLower.includes('experiment') || scriptLower.includes('study') || scriptLower.includes('research') ||
             scriptLower.includes('hypothesis') || scriptLower.includes('results') || scriptLower.includes('finding') ||
             scriptLower.includes('statistical') || scriptLower.includes('quantitative')) {
      musicStyle = "clean atmospheric textures and subtle pulses"
      instruments = "atmospheric pads, soft synth textures, gentle harmonic movement"
      additionalNotes = "analytical and precise atmosphere"
    }
    // Psychology or Social Science
    else if (scriptLower.includes('psychology') || scriptLower.includes('social') || scriptLower.includes('human') ||
             scriptLower.includes('behavior') || scriptLower.includes('cognitive') || scriptLower.includes('mental') ||
             scriptLower.includes('emotion') || scriptLower.includes('society') || scriptLower.includes('culture') ||
             scriptLower.includes('participant') || scriptLower.includes('survey') || scriptLower.includes('interview')) {
      musicStyle = "warm soft ambient pads"
      instruments = "warm atmospheric pads, soft harmonic textures, gentle ambient layers"
      additionalNotes = "warm and empathetic atmosphere"
    }
    // Theoretical or Philosophical
    else if (scriptLower.includes('theoretical') || scriptLower.includes('philosophy') || scriptLower.includes('conceptual') ||
             scriptLower.includes('framework') || scriptLower.includes('theory') || scriptLower.includes('paradigm') ||
             scriptLower.includes('model') || scriptLower.includes('abstract') || scriptLower.includes('metaphysical')) {
      musicStyle = "deep drones and minimal harmonic movement"
      instruments = "deep atmospheric drones, minimal harmonic textures, subtle tonal shifts"
      additionalNotes = "contemplative and philosophical atmosphere"
    }
    // Medical or Health Science
    else if (scriptLower.includes('medical') || scriptLower.includes('health') || scriptLower.includes('clinical') ||
             scriptLower.includes('patient') || scriptLower.includes('treatment') || scriptLower.includes('diagnosis') ||
             scriptLower.includes('therapy') || scriptLower.includes('medicine') || scriptLower.includes('hospital')) {
      musicStyle = "calm atmospheric textures"
      instruments = "gentle atmospheric pads, soft harmonic layers, calming ambient textures"
      additionalNotes = "reassuring and professional medical atmosphere"
    }
    // Biological or Life Sciences
    else if (scriptLower.includes('biology') || scriptLower.includes('organism') || scriptLower.includes('cell') ||
             scriptLower.includes('genetic') || scriptLower.includes('evolution') || scriptLower.includes('species') ||
             scriptLower.includes('ecosystem') || scriptLower.includes('environment') || scriptLower.includes('climate')) {
      musicStyle = "organic ambient textures"
      instruments = "warm ambient pads, natural-sounding textures, gentle atmospheric layers"
      additionalNotes = "natural and exploratory scientific atmosphere"
    }
    // Physics or Mathematics
    else if (scriptLower.includes('physics') || scriptLower.includes('quantum') || scriptLower.includes('mathematical') ||
             scriptLower.includes('equation') || scriptLower.includes('formula') || scriptLower.includes('theorem') ||
             scriptLower.includes('calculation') || scriptLower.includes('mathematics') || scriptLower.includes('geometric')) {
      musicStyle = "precise atmospheric textures with subtle rhythmic pulses"
      instruments = "minimalist ambient textures, subtle harmonic progressions, clean synth pads"
      additionalNotes = "precise and structured analytical atmosphere"
    }
    // General Academic/Research
    else {
      musicStyle = "clean atmospheric textures and subtle pulses"
      instruments = "smooth atmospheric pads, warm drones, soft synth textures"
      additionalNotes = "scientific, analytical, and neutral academic atmosphere"
    }

    // Add rhythmic elements for fast-paced or data-heavy content
    let paceNote = ""
    if (complexity === 'high' || scriptLower.includes('data') || scriptLower.includes('statistics') || 
        scriptLower.includes('analysis') || scriptLower.includes('numerous') || scriptLower.includes('various')) {
      paceNote = " Add very subtle gentle rhythmic pulses to support data presentation without distraction."
    }

    // Build the comprehensive prompt following the user's template
    const promptParts = [
      "Ambient, minimal, non-distracting background music.",
      "No vocals, no drums, no sudden transitions.",
      `Smooth atmospheric pads, ${instruments}.`,
      "Stable energy suitable for narration and research explanations.",
      `Scientific, analytical, and neutral tone. ${musicStyle}.`,
      "3-5 minute seamless background score.",
      additionalNotes,
      paceNote
    ].filter(p => p.trim().length > 0)

    return promptParts.join(' ').trim()
  }

  const handleAutoGeneratePrompt = () => {
    const intelligentPrompt = generateIntelligentPrompt()
    setPrompt(intelligentPrompt)
    setSelectedPreset(null)
    toast.success('Intelligent prompt generated based on your script content!')
  }

  const handleSelectPreset = (presetId: string) => {
    const preset = presetStyles.find(p => p.id === presetId)
    if (preset) {
      setPrompt(preset.prompt)
      setSelectedPreset(presetId)
      toast.success(`"${preset.name}" style selected!`)
    }
  }

  const handleAutoGenerateMusic = async () => {
    if (!prompt.trim()) {
      // First generate intelligent prompt
      handleAutoGeneratePrompt()
      // Wait a bit then generate
      setTimeout(async () => {
        if (prompt.trim() || generateIntelligentPrompt()) {
          const finalPrompt = prompt.trim() || generateIntelligentPrompt()
          setPrompt(finalPrompt)
          await handleGenerate()
        }
      }, 500)
      return
    }
    await handleGenerate()
  }

  // Auto-generate prompt when script content changes
  useEffect(() => {
    if (scriptContent && scriptContent.trim().length > 0 && !prompt) {
      const intelligentPrompt = generateIntelligentPrompt()
      setPrompt(intelligentPrompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptContent])

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
            
            {/* Preset Music Styles */}
            {scriptContent && (
              <div className="space-y-2">
                <Label>Quick Preset Styles (Click to select)</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {presetStyles.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      variant={selectedPreset === preset.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSelectPreset(preset.id)}
                      className="text-xs h-auto py-2 px-2 whitespace-normal"
                      disabled={isGenerating}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Choose a preset style that matches your research topic, or use auto-generate for custom analysis.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="prompt">Music Prompt (Auto-generated from script analysis)</Label>
                {scriptContent && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAutoGeneratePrompt}
                    className="text-xs h-7"
                    disabled={isGenerating}
                  >
                    ✨ Analyze & Generate Prompt
                  </Button>
                )}
              </div>
              <textarea
                id="prompt"
                placeholder="Click 'Analyze & Generate Prompt' or select a preset style above. The prompt will be automatically generated based on your research content analysis..."
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value)
                  setSelectedPreset(null)
                }}
                disabled={isGenerating}
                className="w-full min-h-[100px] p-3 border rounded-lg resize-y"
                rows={4}
              />
              <p className="text-sm text-muted-foreground">
                {scriptContent ? (
                  <>
                    <strong>AI Analysis:</strong> The system analyzes your script content (tone, complexity, subject area) and generates appropriate background music prompts. 
                    <strong> Tip:</strong> Click "Analyze & Generate Prompt" for custom analysis or select a preset style above.
                  </>
                ) : (
                  <>
                    <strong>Note:</strong> This requires a Stability AI API key with Stable Audio access. Upload your own music file if API access is not available.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (seconds) - Choose your desired length</Label>
              <Input
                id="duration"
                type="number"
                min={30}
                max={95}
                value={duration}
                onChange={(e) => setDuration(Math.min(95, Math.max(30, parseInt(e.target.value) || 30)))}
                disabled={isGenerating}
                placeholder="Enter duration (30-95 seconds)"
              />
              <p className="text-sm text-muted-foreground">
                <strong>Your choice:</strong> Set any duration between 30-95 seconds based on your needs. 
                Recommended: {totalDuration} seconds (matches script duration).
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
                    Upload Music
                  </>
                )}
              </Button>

              {scriptContent && prompt && (
                <Button
                  variant="default"
                  onClick={handleAutoGenerateMusic}
                  disabled={isGenerating}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Music className="mr-2 h-4 w-4" />
                      🎵 Auto-Generate Music (Recommended)
                    </>
                  )}
                </Button>
              )}

              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className={scriptContent && prompt ? "flex-1" : "flex-1"}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Music className="mr-2 h-4 w-4" />
                    Generate (Manual)
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

