import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Bold, 
  Italic, 
  Underline, 
  RotateCcw, 
  CheckCircle, 
  Download, 
  Copy,
  Play,
  Pause,
  Video,
  Volume2,
  Headphones,
  Film
} from 'lucide-react'
import { toast } from 'sonner'
import { VisualGallery } from './VisualGallery'
import { AudioGallery } from './AudioGallery'
import { VideoTimelineEditor } from './VideoTimelineEditor'
import { elevenLabsService } from '@/services/elevenLabsService'
import { Sentence, SentenceVisual, SentenceAudio, ScriptData } from '@/services/geminiService'

// Limit video generation to first N sentences for testing (configurable)
const MAX_SENTENCES_FOR_VIDEO = 999 // Show all sentences

interface SimpleScriptEditorProps {
  scriptData: ScriptData | null
  onApprove: (sentenceId: string) => void
  onRegenerate: () => void
  onExport: (data: ScriptData) => void
  onScriptUpdate?: (data: ScriptData) => void // Callback to sync state back to parent
  isLoading?: boolean
  paperContext?: string // Paper title, authors, etc. for video generation context
}

export function SimpleScriptEditor({ 
  scriptData, 
  onApprove, 
  onRegenerate, 
  onExport,
  onScriptUpdate,
  isLoading = false,
  paperContext 
}: SimpleScriptEditorProps) {
  const [selectedSentenceId, setSelectedSentenceId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentScriptData, setCurrentScriptData] = useState<ScriptData | null>(scriptData)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [showVisualGallery, setShowVisualGallery] = useState(false)
  const [showAudioGallery, setShowAudioGallery] = useState(false)
  const [showTimelineEditor, setShowTimelineEditor] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  // Auto-show VideoTimelineEditor when there are approved visuals
  useEffect(() => {
    if (currentScriptData) {
      const approvedVisualsCount = currentScriptData.sentences.filter(
        s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)
      ).length;
      
      if (approvedVisualsCount > 0 && !showTimelineEditor) {
        // Auto-show timeline editor when videos are approved
        console.log('🎬 Auto-showing VideoTimelineEditor -', approvedVisualsCount, 'approved visuals');
        setShowTimelineEditor(true);
      }
    }
  }, [currentScriptData, showTimelineEditor])

  // Update local state when scriptData changes, but preserve approved visuals/audio
  useEffect(() => {
    if (!scriptData) return;
    
    // CRITICAL: Create a hash to detect if scriptData actually changed
    const scriptDataHash = JSON.stringify(scriptData.sentences?.map(s => ({
      id: s.id,
      visualApproved: s.visual?.approved,
      hasVideoUrl: !!s.visual?.videoUrl,
      hasImageUrl: !!s.visual?.imageUrl,
    })));
    
    const currentDataHash = JSON.stringify(currentScriptData?.sentences?.map(s => ({
      id: s.id,
      visualApproved: s.visual?.approved,
      hasVideoUrl: !!s.visual?.videoUrl,
      hasImageUrl: !!s.visual?.imageUrl,
    })));
    
    // If hashes are same, don't update (prevent unnecessary re-renders)
    if (scriptDataHash === currentDataHash && currentScriptData) {
      console.log('⏭️ scriptData unchanged, skipping update');
      return;
    }
    
    // CRITICAL: If scriptData prop has approved visuals, ALWAYS use it (it's the source of truth from parent)
    const propHasApprovedVisuals = scriptData.sentences?.some(s => s.visual?.approved === true);
    const propApprovedCount = scriptData.sentences?.filter(s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)).length || 0;
    
    // If prop has approved visuals, it means parent updated - use it directly
    if (propHasApprovedVisuals || propApprovedCount > 0) {
      console.log('📥 scriptData prop has approved visuals, using it directly:', {
        approvedCount: propApprovedCount,
        totalSentences: scriptData.sentences.length,
        approvedDetails: scriptData.sentences
          .filter(s => s.visual?.approved === true)
          .map(s => ({
            id: s.id.substring(0, 8),
            approved: s.visual?.approved,
            hasVideo: !!(s.visual?.videoUrl || s.visual?.imageUrl),
          })),
      });
      setCurrentScriptData(scriptData);
      return;
    }
    
    // Only merge if we have existing data with approved visuals/audio AND prop doesn't have them
    if (currentScriptData && currentScriptData.sentences.length > 0) {
      // Check if we have any approved visuals/audio to preserve
      const hasApprovedContent = currentScriptData.sentences.some(
        s => s.visual?.approved || s.audio?.approved
      )
      
      if (hasApprovedContent) {
        // Create a map of existing sentences with their visuals/audio
        const existingSentencesMap = new Map(
          currentScriptData.sentences.map(s => [s.id, s])
        )
        
        // Merge: keep approved visuals/audio from existing, update with new scriptData
        const mergedSentences = scriptData.sentences.map(newSentence => {
          const existingSentence = existingSentencesMap.get(newSentence.id)
          
          if (existingSentence) {
            // CRITICAL: If existing visual is approved, preserve ALL its properties
            const preservedVisual = existingSentence.visual?.approved 
              ? {
                  ...existingSentence.visual, // Keep ALL properties of approved visual
                  // Ensure videoUrl and imageUrl are preserved
                  videoUrl: existingSentence.visual.videoUrl,
                  imageUrl: existingSentence.visual.imageUrl,
                  thumbnailUrl: existingSentence.visual.thumbnailUrl,
                  mode: existingSentence.visual.mode,
                  transitionType: existingSentence.visual.transitionType,
                  subtitleSettings: existingSentence.visual.subtitleSettings,
                }
              : (newSentence.visual || existingSentence.visual)
            
            // Preserve approved visuals and audio - never overwrite if approved
            return {
              ...newSentence,
              visual: preservedVisual,
              // Keep existing audio if approved, otherwise use new one
              audio: existingSentence.audio?.approved 
                ? existingSentence.audio 
                : (newSentence.audio || existingSentence.audio),
              // Preserve approval status
              approved: existingSentence.approved || newSentence.approved,
            }
          }
          
          return newSentence
        })
        
        const mergedScriptData = {
          ...scriptData,
          sentences: mergedSentences,
        }
        
        console.log('🔄 Merging scriptData, preserving approved visuals:', {
          approvedCount: mergedSentences.filter(s => s.visual?.approved === true).length,
          totalSentences: mergedSentences.length,
        })
        
        setCurrentScriptData(mergedScriptData)
        return // Don't set isInitialLoad if we're merging
      }
    }
    
    // First load or no approved content to preserve - just set it
    setCurrentScriptData(scriptData)
    setIsInitialLoad(true)
  }, [scriptData, scriptData?.sentences]) // Watch scriptData and sentences array

  // Set initial content only once when script data changes
  useEffect(() => {
    if (scriptData && editorRef.current && isInitialLoad) {
      editorRef.current.innerHTML = scriptData.script
      setIsInitialLoad(false)
    }
  }, [scriptData, isInitialLoad])

  const handleFormatText = (format: 'bold' | 'italic' | 'underline') => {
    document.execCommand(format)
    editorRef.current?.focus()
  }

  const handleEditorChange = () => {
    if (!editorRef.current || !currentScriptData) return
    
    // Save cursor position before updating
    const selection = window.getSelection()
    let range = null
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0)
    }
    
    const newContent = editorRef.current.innerText // Get plain text for parsing
    const newHtmlContent = editorRef.current.innerHTML
    
    // Parse new content into sentences, keeping punctuation
    // Split by sentence endings but keep the punctuation with the sentence
    const sentences: string[] = []
    let currentSentence = ''
    
    for (let i = 0; i < newContent.length; i++) {
      const char = newContent[i]
      currentSentence += char
      
      // Check for sentence endings
      if (['.', '!', '?'].includes(char)) {
        // Check if it's the end of a sentence (next char is space, or end of text, or newline)
        const nextChar = newContent[i + 1]
        if (!nextChar || nextChar === ' ' || nextChar === '\n' || nextChar === '\r') {
          const trimmed = currentSentence.trim()
          if (trimmed.length > 0) {
            sentences.push(trimmed)
          }
          currentSentence = ''
        }
      }
    }
    
    // Add any remaining text as the last sentence
    const remaining = currentSentence.trim()
    if (remaining.length > 0 && sentences.length > 0) {
      // Append to last sentence if there's remaining text
      sentences[sentences.length - 1] += ' ' + remaining
    } else if (remaining.length > 0) {
      sentences.push(remaining)
    }
    
    // Update script data with new sentences
    if (sentences.length > 0) {
      const updatedSentences = sentences.map((text, index) => {
        const originalSentence = currentScriptData.sentences[index]
        return {
          ...originalSentence,
          text: text.trim(),
        } as Sentence
      })
      
      // Ensure we maintain the same number of sentences
      const finalSentences = updatedSentences.length >= currentScriptData.sentences.length 
        ? updatedSentences 
        : [...updatedSentences, ...currentScriptData.sentences.slice(updatedSentences.length)]
      
      const updatedScriptData: ScriptData = {
        ...currentScriptData,
        script: newHtmlContent,
        sentences: finalSentences,
      }
      
      setCurrentScriptData(updatedScriptData)
      
      // Restore cursor position
      if (selection && range) {
        try {
          selection.removeAllRanges()
          selection.addRange(range)
        } catch (e) {
          // Ignore cursor restoration errors
        }
      }
    }
  }

  const handleSentenceClick = (sentenceId: string) => {
    setSelectedSentenceId(sentenceId)
  }

  const handleApproveSentence = (sentenceId: string) => {
    if (!currentScriptData) return
    
    // Update local state
    const updatedSentences = currentScriptData.sentences.map(sentence =>
      sentence.id === sentenceId ? { ...sentence, approved: true } : sentence
    )
    
    setCurrentScriptData({
      ...currentScriptData,
      sentences: updatedSentences
    })
    
    // Notify parent
    onApprove(sentenceId)
    toast.success('Sentence approved')
  }

  const handleVisualUpdate = (sentenceId: string, visual: SentenceVisual) => {
    if (!currentScriptData) {
      console.error('❌ handleVisualUpdate: currentScriptData is null!')
      return
    }

    console.log('🔄 handleVisualUpdate called:', {
      sentenceId,
      visualApproved: visual.approved,
      visualStatus: visual.status,
      hasVideoUrl: !!visual.videoUrl,
      hasImageUrl: !!visual.imageUrl,
      videoUrl: visual.videoUrl ? visual.videoUrl.substring(0, 50) + '...' : 'MISSING',
      imageUrl: visual.imageUrl ? visual.imageUrl.substring(0, 50) + '...' : 'MISSING',
      mode: visual.mode,
    })

    // CRITICAL: Deep merge to preserve ALL visual properties
    const updatedSentences = currentScriptData.sentences.map(sentence => {
      if (sentence.id === sentenceId) {
        // CRITICAL: If visual is approved, preserve ALL properties including videoUrl/imageUrl
        const mergedVisual: SentenceVisual = {
          ...sentence.visual, // Keep existing properties first
          ...visual, // Override with new properties
          // CRITICAL: Explicitly preserve these properties - don't lose them!
          videoUrl: visual.videoUrl || sentence.visual?.videoUrl || undefined,
          imageUrl: visual.imageUrl || sentence.visual?.imageUrl || undefined,
          thumbnailUrl: visual.thumbnailUrl || sentence.visual?.thumbnailUrl || undefined,
          mode: visual.mode || sentence.visual?.mode,
          transitionType: visual.transitionType || sentence.visual?.transitionType,
          subtitleSettings: visual.subtitleSettings || sentence.visual?.subtitleSettings,
          // CRITICAL: Ensure approved status is set
          approved: visual.approved !== undefined ? visual.approved : (sentence.visual?.approved || false),
          status: visual.status || sentence.visual?.status || 'pending',
        }
        
        console.log('🔧 Merged visual for sentence:', {
          sentenceId,
          approved: mergedVisual.approved,
          hasVideoUrl: !!mergedVisual.videoUrl,
          hasImageUrl: !!mergedVisual.imageUrl,
          videoUrl: mergedVisual.videoUrl ? mergedVisual.videoUrl.substring(0, 30) + '...' : 'NO',
          imageUrl: mergedVisual.imageUrl ? mergedVisual.imageUrl.substring(0, 30) + '...' : 'NO',
          mode: mergedVisual.mode,
        })
        
        return { ...sentence, visual: mergedVisual }
      }
      return sentence
    })

    const updatedScriptData = {
      ...currentScriptData,
      sentences: updatedSentences
    }

    const approvedCount = updatedScriptData.sentences.filter(
      s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)
    ).length;

    // Find the updated sentence to verify
    const updatedSentence = updatedSentences.find(s => s.id === sentenceId)
    
    console.log('✅ Updated scriptData:', {
      totalSentences: updatedScriptData.sentences.length,
      approvedVisuals: approvedCount,
      updatedSentenceVisual: {
        approved: updatedSentence?.visual?.approved,
        hasVideoUrl: !!updatedSentence?.visual?.videoUrl,
        hasImageUrl: !!updatedSentence?.visual?.imageUrl,
        videoUrl: updatedSentence?.visual?.videoUrl ? 'YES' : 'NO',
        imageUrl: updatedSentence?.visual?.imageUrl ? 'YES' : 'NO',
        mode: updatedSentence?.visual?.mode,
      },
      allApprovedVisuals: updatedScriptData.sentences
        .filter(s => s.visual?.approved === true)
        .map(s => ({ 
          id: s.id.substring(0, 8), 
          approved: s.visual?.approved,
          hasVideo: !!(s.visual?.videoUrl || s.visual?.imageUrl),
          videoUrl: s.visual?.videoUrl ? 'YES' : 'NO',
          imageUrl: s.visual?.imageUrl ? 'YES' : 'NO',
          mode: s.visual?.mode,
        })),
    })

    // CRITICAL: Update local state first
    setCurrentScriptData(updatedScriptData)
    
    // CRITICAL: Sync back to parent IMMEDIATELY - this will trigger prop update
    if (onScriptUpdate) {
      console.log('📤 Syncing to parent via onScriptUpdate with', approvedCount, 'approved visuals')
      // Call immediately - React will batch updates
      onScriptUpdate(updatedScriptData)
    } else {
      console.warn('⚠️ onScriptUpdate not provided - state won\'t persist!')
    }
  }

  const handleVisualApprove = (sentenceId: string) => {
    handleApproveSentence(sentenceId)
  }

  const handleVisualReject = (_sentenceId: string) => {
    // Visual rejected - can still approve sentence text separately
    toast.info('Video rejected. You can still approve the sentence text.')
  }

  const handleAudioUpdate = (sentenceId: string, audio: SentenceAudio) => {
    if (!currentScriptData) return

    const updatedSentences = currentScriptData.sentences.map(sentence =>
      sentence.id === sentenceId ? { ...sentence, audio } : sentence
    )

    const updatedScriptData = {
      ...currentScriptData,
      sentences: updatedSentences
    }

    setCurrentScriptData(updatedScriptData)
    
    // Sync back to parent for persistence
    if (onScriptUpdate) {
      onScriptUpdate(updatedScriptData)
    }
  }

  const handleAudioApprove = (sentenceId: string) => {
    handleApproveSentence(sentenceId)
  }

  const handleAudioReject = (_sentenceId: string) => {
    // Audio rejected - can still approve sentence text separately
    toast.info('Audio rejected. You can still approve the sentence text.')
  }

  const hasApprovedAudio = (): boolean => {
    if (!currentScriptData) return false
    const approvedAudio = currentScriptData.sentences.filter(
      s => s.audio?.approved && s.audio?.audioBase64
    )
    return approvedAudio.length > 0
  }

  const handleExportPodcast = async () => {
    if (!currentScriptData) {
      toast.error('No script data available')
      return
    }

    const approvedAudioClips = currentScriptData.sentences
      .filter(s => s.audio?.approved && s.audio?.audioBase64)
      .map(s => ({
        sentenceId: s.id,
        audioBase64: s.audio!.audioBase64!,
        duration: s.audio!.duration,
      }))

    if (approvedAudioClips.length === 0) {
      toast.error('No approved audio clips found. Please approve at least one audio clip.')
      return
    }

    try {
      toast.info(`Generating podcast from ${approvedAudioClips.length} audio clips...`)
      
      const result = await elevenLabsService.generatePodcast(approvedAudioClips)

      // Download the podcast
      const link = document.createElement('a')
      link.href = result.podcastUrl
      link.download = `podcast-${Date.now()}.mp3`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up blob URL
      URL.revokeObjectURL(result.podcastUrl)

      toast.success(`Podcast exported successfully! (${Math.ceil(result.duration)}s, ${result.clipCount} clips)`)
    } catch (error) {
      console.error('Error exporting podcast:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to export podcast'
      toast.error(errorMessage, { duration: 5000 })
    }
  }

  // Get context for video generation (previous sentences + paper context)
  const getVideoContext = (sentenceIndex: number): string => {
    if (!currentScriptData || !paperContext) return ''
    
    // Include paper context
    let context = paperContext + '\n\n'
    
    // Include previous sentences for context
    const previousSentences = currentScriptData.sentences
      .slice(0, sentenceIndex)
      .map(s => s.text)
      .join(' ')
    
    if (previousSentences) {
      context += 'Previous context: ' + previousSentences
    }
    
    return context
  }

  // Get sentences eligible for video generation (first N sentences)
  const getEligibleSentences = () => {
    if (!currentScriptData) return []
    return currentScriptData.sentences.slice(0, MAX_SENTENCES_FOR_VIDEO)
  }

  const handleCopyScript = () => {
    if (currentScriptData?.script) {
      const textContent = editorRef.current?.innerText || currentScriptData.script
      navigator.clipboard.writeText(textContent)
      toast.success('Script copied to clipboard')
    }
  }

  const handleExportScript = () => {
    if (currentScriptData) {
      const updatedData = {
        ...currentScriptData,
        script: editorRef.current?.innerHTML || currentScriptData.script
      }
      onExport(updatedData)
      toast.success('Script exported successfully')
    }
  }

  const togglePlayback = () => {
    setIsPlaying(!isPlaying)
    // TODO: Implement actual audio playback
  }

  const renderSentence = (sentence: Sentence) => {
    const isSelected = selectedSentenceId === sentence.id
    const isApproved = sentence.approved

    return (
      <div
        key={sentence.id}
        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
          isSelected 
            ? 'border-primary bg-primary/5' 
            : isApproved 
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' 
              : 'border-muted hover:border-muted-foreground/50'
        }`}
        onClick={() => handleSentenceClick(sentence.id)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={isApproved ? "default" : "secondary"} className="text-xs">
                {isApproved ? 'Approved' : 'Pending'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Sentence {sentence.id}
              </span>
              {sentence.startTime && sentence.endTime && (
                <span className="text-xs text-muted-foreground">
                  {Math.floor(sentence.startTime)}s - {Math.floor(sentence.endTime)}s
                </span>
              )}
            </div>
            <p className={`text-sm leading-relaxed ${
              isApproved ? 'text-green-700 dark:text-green-300' : ''
            }`}>
              {sentence.text}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!isApproved && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  handleApproveSentence(sentence.id)
                }}
                className="h-8 w-8 p-0"
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderRichTextEditor = () => {
    if (!currentScriptData) return null

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Script Editor</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Version {currentScriptData.version}</Badge>
              <span className="text-sm text-muted-foreground">
                Generated {new Date(currentScriptData.generatedAt).toLocaleString()}
              </span>
            </div>
          </CardTitle>
          <CardDescription>
            Edit your script with rich text formatting. Changes sync to sentence management in real-time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/20">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFormatText('bold')}
              className="h-8 w-8 p-0"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFormatText('italic')}
              className="h-8 w-8 p-0"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFormatText('underline')}
              className="h-8 w-8 p-0"
            >
              <Underline className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button
              size="sm"
              variant="outline"
              onClick={togglePlayback}
              className="h-8 w-8 p-0"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </div>

          {/* Simple Editor */}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleEditorChange}
            className="min-h-[200px] p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            suppressContentEditableWarning={true}
          />

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={onRegenerate}
                disabled={isLoading}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
              <Button
                variant="outline"
                onClick={handleCopyScript}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Script
              </Button>
            </div>
            <Button
              onClick={handleExportScript}
              className="bg-green-600 hover:bg-green-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Script
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderSentenceList = () => {
    if (!currentScriptData || currentScriptData.sentences.length === 0) return null

    const approvedCount = currentScriptData.sentences.filter(s => s.approved).length
    const totalCount = currentScriptData.sentences.length

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Sentence Management</span>
            <Badge variant="outline">
              {approvedCount}/{totalCount} approved
            </Badge>
          </CardTitle>
          <CardDescription>
            Review and approve individual sentences. Approved sentences will be included in the final script.
            <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
              💡 Changes in the editor above automatically sync here
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {currentScriptData.sentences.map(renderSentence)}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!currentScriptData) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            Upload a JSON file and generate a script to start editing.
          </p>
        </CardContent>
      </Card>
    )
  }

  const renderVisualGallery = () => {
    if (!currentScriptData || !showVisualGallery) return null

    const eligibleSentences = getEligibleSentences()

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              <span>Video Generation</span>
            </div>
            <Badge variant="outline">
              All Sentences
            </Badge>
          </CardTitle>
          <CardDescription>
            Generate professional videos for each sentence. Approve videos before finalizing the script.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {eligibleSentences.map((sentence, index) => (
            <VisualGallery
              key={sentence.id}
              sentence={sentence}
              context={getVideoContext(index)}
              onApprove={handleVisualApprove}
              onReject={handleVisualReject}
              onVisualUpdate={handleVisualUpdate}
            />
          ))}
        </CardContent>
      </Card>
    )
  }

  const renderAudioGallery = () => {
    if (!currentScriptData || !showAudioGallery) return null

    const eligibleSentences = getEligibleSentences()

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              <span>Audio Narration</span>
            </div>
            <Badge variant="outline">
              All Sentences
            </Badge>
          </CardTitle>
          <CardDescription>
            Generate or upload audio narration for each sentence. Approve audio before exporting podcast.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {eligibleSentences.map((sentence) => (
            <AudioGallery
              key={sentence.id}
              sentence={sentence}
              onApprove={handleAudioApprove}
              onReject={handleAudioReject}
              onAudioUpdate={handleAudioUpdate}
            />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {renderRichTextEditor()}
      
      {/* Visual Gallery Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Video Generation</h3>
          <p className="text-sm text-muted-foreground">
            Generate videos for all sentences in your script
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowVisualGallery(!showVisualGallery)}
        >
          <Video className="h-4 w-4 mr-2" />
          {showVisualGallery ? 'Hide Gallery' : 'Show Gallery'}
        </Button>
      </div>
      
      {showVisualGallery && renderVisualGallery()}

      {/* Audio Gallery Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Audio Narration</h3>
          <p className="text-sm text-muted-foreground">
            Generate or upload audio narration for all sentences
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAudioGallery(!showAudioGallery)}
          >
            <Volume2 className="h-4 w-4 mr-2" />
            {showAudioGallery ? 'Hide Audio' : 'Show Audio'}
          </Button>
          {currentScriptData && (
            <Button
              variant="default"
              onClick={handleExportPodcast}
              disabled={!hasApprovedAudio()}
            >
              <Headphones className="h-4 w-4 mr-2" />
              Export Podcast
            </Button>
          )}
        </div>
      </div>
      
      {showAudioGallery && renderAudioGallery()}

      {/* Video Timeline Editor Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Video Assembly</h3>
          <p className="text-sm text-muted-foreground">
            Assemble approved visuals and narration into final video
            {(() => {
              if (!currentScriptData) return null;
              const approvedVisuals = currentScriptData.sentences.filter(
                s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)
              );
              const approvedAudio = currentScriptData.sentences.filter(
                s => s.audio?.approved === true
              );
              const totalApproved = approvedVisuals.length;
              
              // Debug logging
              if (totalApproved > 0) {
                console.log('📊 Approved count calculation:', {
                  totalApproved,
                  approvedVisuals: approvedVisuals.length,
                  approvedAudio: approvedAudio.length,
                  sentencesWithVisual: currentScriptData.sentences.filter(s => s.visual).length,
                  allVisuals: currentScriptData.sentences.map(s => ({
                    id: s.id.substring(0, 8),
                    approved: s.visual?.approved,
                    hasVideo: !!(s.visual?.videoUrl || s.visual?.imageUrl),
                  })),
                });
              }
              
              return (
                <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                  ({totalApproved} approved {totalApproved === 1 ? 'video' : 'videos'})
                </span>
              );
            })()}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowTimelineEditor(!showTimelineEditor)}
        >
          <Film className="h-4 w-4 mr-2" />
          {showTimelineEditor ? 'Hide Editor' : 'Show Editor'}
        </Button>
      </div>
      
      {showTimelineEditor && currentScriptData && (() => {
        const approvedCount = currentScriptData.sentences.filter(
          s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)
        ).length;
        
        // Create a stable key based on approved visuals
        const approvedVisualsKey = currentScriptData.sentences
          .filter(s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl))
          .map(s => `${s.id}-${s.visual?.videoUrl ? 'v' : ''}-${s.visual?.imageUrl ? 'i' : ''}`)
          .join('|');
        
        // CRITICAL: Log what we're passing to VideoTimelineEditor
        const approvedVisuals = currentScriptData.sentences.filter(
          s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)
        );
        
        console.log('🎬 Rendering VideoTimelineEditor:', {
          approvedCount,
          totalSentences: currentScriptData.sentences.length,
          scriptDataId: currentScriptData.id || 'default',
          approvedVisualsDetails: approvedVisuals.map(s => ({
            id: s.id.substring(0, 8),
            approved: s.visual?.approved,
            hasVideoUrl: !!s.visual?.videoUrl,
            hasImageUrl: !!s.visual?.imageUrl,
          })),
        });
        
        return (
          <VideoTimelineEditor
            key={`timeline-${currentScriptData.id || 'default'}-${approvedCount}-${approvedVisualsKey.substring(0, 100)}`}
            scriptData={currentScriptData}
            onExport={(videoUrl, videoBase64) => {
              console.log('Video exported:', { videoUrl, videoBase64 })
              toast.success('Video exported successfully!')
            }}
          />
        );
      })()}
      
      {renderSentenceList()}
    </div>
  )
}
