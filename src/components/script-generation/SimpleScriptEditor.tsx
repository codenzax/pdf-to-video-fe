import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Film,
  Music
} from 'lucide-react'
import { toast } from 'sonner'
import { VisualGallery } from './VisualGallery'
import { AudioGallery } from './AudioGallery'
import { VideoTimelineEditor } from './VideoTimelineEditor'
import { BackgroundMusicComponent } from './BackgroundMusic'
// Removed SentenceEditor - sentences are now only displayed as text, all editing in Final Video Editor
// Removed unused import
// import { elevenLabsService } from '@/services/elevenLabsService'
import { Sentence, SentenceVisual, SentenceAudio, ScriptData, BackgroundMusic } from '@/services/geminiService'

// Limit video generation to first N sentences for testing (configurable)
const MAX_SENTENCES_FOR_VIDEO = 999 // Show all sentences

interface SimpleScriptEditorProps {
  scriptData: ScriptData | null
  onApprove: (sentenceId: string) => void
  onRegenerate: () => void
  onExport: (data: ScriptData) => void
  onVideoExport?: (videoUrl: string, videoBase64: string) => void // Callback for video export from VideoTimelineEditor
  onScriptUpdate?: (data: ScriptData) => void // Callback to sync state back to parent
  isLoading?: boolean
  paperContext?: string // Paper title, authors, etc. for video generation context
  tables?: Array<{ title: string; data: string }> // Tables data for contextual image enhancement
  images?: Array<{ title: string; description: string }> // Images/figures data for contextual image enhancement
}

export function SimpleScriptEditor({ 
  scriptData, 
  onApprove, 
  onRegenerate, 
  onExport,
  onVideoExport,
  onScriptUpdate,
  isLoading = false,
  paperContext,
  tables,
  images
}: SimpleScriptEditorProps) {
  const [selectedSentenceId, _setSelectedSentenceId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentScriptData, setCurrentScriptData] = useState<ScriptData | null>(scriptData)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [showEditorDialog, setShowEditorDialog] = useState(false)
  const [showVisualGallery, setShowVisualGallery] = useState(false)
  const [showAudioGallery, setShowAudioGallery] = useState(false)
  const [showBackgroundMusic, setShowBackgroundMusic] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isDialogClosingRef = useRef(false)
  const isUserEditingRef = useRef(false) // Track when user is actively editing

  // Removed handleCloseDialog - DialogContent already has built-in close button

  // Note: Editor is now opened manually via "Open Video Editor" button

  // Sync scriptData prop to currentScriptData - scriptData prop is source of truth
  useEffect(() => {
    if (!scriptData) {
      setCurrentScriptData(null)
      return
    }
    
    // Don't sync if user is actively editing
    if (isUserEditingRef.current) {
      return
    }
    
    // Update currentScriptData from prop, preserving user edits if they exist
    setCurrentScriptData(prev => {
      if (!prev) {
        return scriptData
      }
      
      // Preserve user's text edits from currentScriptData
      const mergedSentences = scriptData.sentences.map((propSentence, idx) => {
        const currentSentence = prev.sentences?.[idx]
        if (currentSentence) {
          return {
            ...propSentence,
            text: currentSentence.text, // Preserve user's text edits
            presentation_text: currentSentence.presentation_text, // Preserve presentation_text
            approved: currentSentence.approved,
            audio: currentSentence.audio,
            visual: propSentence.visual || currentSentence.visual
          }
        }
        return propSentence
      })
      
      return {
        ...scriptData,
        script: prev.script || scriptData.script, // Preserve edited script HTML
        sentences: mergedSentences
      }
    })
    
    // Update editor content when script changes (but not if user is editing)
    if (editorRef.current && !isUserEditingRef.current && scriptData.script) {
      const currentHtml = editorRef.current.innerHTML
      if (currentHtml !== scriptData.script) {
        editorRef.current.innerHTML = scriptData.script
        setIsInitialLoad(false)
      } else if (isInitialLoad && scriptData.script) {
        editorRef.current.innerHTML = scriptData.script
        setIsInitialLoad(false)
      }
    }
  }, [scriptData])

  // Initialize editor content on mount
  useEffect(() => {
    if (editorRef.current && scriptData?.script && isInitialLoad && !editorRef.current.innerHTML.trim()) {
      editorRef.current.innerHTML = scriptData.script
      setIsInitialLoad(false)
    }
  }, [scriptData, isInitialLoad])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    }
  }, [])

  const handleFormatText = (format: 'bold' | 'italic' | 'underline') => {
    document.execCommand(format)
    editorRef.current?.focus()
  }

  const handleEditorChange = () => {
    if (!editorRef.current || !currentScriptData) return
    
    // Mark that user is actively editing
    isUserEditingRef.current = true
    
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
        if (originalSentence) {
          // Preserve all original properties, only update text
          return {
            ...originalSentence,
            text: text.trim(),
          } as Sentence
        } else {
          // Create new sentence if it doesn't exist
          return {
            id: `sentence_${Date.now()}_${index}`,
            text: text.trim(),
            approved: false,
          } as Sentence
        }
      })
      
      // Ensure we maintain the same number of sentences
      // If we have more sentences than before, keep the new ones
      // If we have fewer, keep the existing ones that weren't updated
      const finalSentences = updatedSentences.length >= currentScriptData.sentences.length 
        ? updatedSentences 
        : [...updatedSentences, ...currentScriptData.sentences.slice(updatedSentences.length)]
      
      const updatedScriptData: ScriptData = {
        ...currentScriptData,
        script: newHtmlContent,
        sentences: finalSentences,
      }
      
      setCurrentScriptData(updatedScriptData)
      
      // Sync changes to parent component (sentence management) - REAL-TIME
      if (onScriptUpdate) {
        // Clear existing timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
        
        // Call immediately for real-time updates - this updates the parent
        onScriptUpdate(updatedScriptData)
        
        // Set a debounced version to mark editing as complete
        saveTimeoutRef.current = setTimeout(() => {
          isUserEditingRef.current = false // Mark editing as complete after 500ms
          saveTimeoutRef.current = null
        }, 500) // Debounce to mark editing complete
      }
      
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

    // CRITICAL: Validate sentenceId exists in currentScriptData
    const targetSentence = currentScriptData.sentences.find(s => s.id === sentenceId)
    if (!targetSentence) {
      console.error('❌ handleVisualUpdate: Sentence not found!', {
        sentenceId,
        availableIds: currentScriptData.sentences.map(s => s.id.substring(0, 8)),
      })
      return
    }

    // Removed verbose logging

    // CRITICAL: Deep merge to preserve ALL visual properties
    // Use functional update to ensure we're working with latest state
    setCurrentScriptData(prev => {
      if (!prev) return prev
      
      const updatedSentences = prev.sentences.map(sentence => {
        // CRITICAL: Strict ID matching - only update the exact sentence
        if (sentence.id !== sentenceId) {
          return sentence // Return unchanged for all other sentences
        }
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
          // CRITICAL: Preserve prompt and subtitleText when updating
          prompt: visual.prompt !== undefined ? visual.prompt : sentence.visual?.prompt,
          subtitleText: visual.subtitleText !== undefined ? visual.subtitleText : sentence.visual?.subtitleText,
          // CRITICAL: Ensure approved status is set - force boolean true/false
          approved: visual.approved === true || visual.status === 'approved' ? true : false,
          status: visual.status || sentence.visual?.status || (visual.approved ? 'approved' : 'pending'),
        }
        
        // Removed verbose logging
        
        // REMOVED: Auto-open logic - user should manually open editor
        // Auto-opening causes dialog to re-open after close, causing issues
        // Only allow manual open via button click

        return { ...sentence, visual: mergedVisual }
      })
      
      const updatedScriptData = {
        ...prev,
        sentences: updatedSentences
      }

      // Removed unused variables
      
      // Removed verbose logging

      return updatedScriptData
    })
    
    // CRITICAL: Only save when video is generated or approved - NOT on every subtitle setting change
    // This prevents excessive session updates. Subtitle settings will be saved when user clicks Approve.
    // Only save here if it's a new video generation (has videoUrl/imageUrl but visual wasn't set before)
    const isNewVideoGeneration = (visual.videoUrl || visual.imageUrl) && (!targetSentence.visual?.videoUrl && !targetSentence.visual?.imageUrl)
    const isApprovedVideo = visual.approved === true
    
    if (onScriptUpdate && (isNewVideoGeneration || isApprovedVideo)) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      // Save immediately for approved videos, debounce for new generations
      const saveDelay = isApprovedVideo ? 0 : 2000
      
      if (saveDelay === 0) {
        // Save immediately for approved videos (critical data)
        setCurrentScriptData(prev => {
          if (prev && onScriptUpdate) {
            onScriptUpdate(prev)
          }
          return prev
        })
      } else {
        // Debounce save for new video generations
        saveTimeoutRef.current = setTimeout(() => {
          setCurrentScriptData(prev => {
            if (prev && onScriptUpdate) {
              onScriptUpdate(prev)
            }
            return prev
          })
          saveTimeoutRef.current = null
        }, saveDelay)
      }
    }
  }

  // Combined approve function for video + audio
  // NOTE: This is used by AudioGallery, not VisualGallery
  // VisualGallery calls handleVisualUpdate directly, then onApprove which calls handleVisualApprove
  const handleCombinedApprove = (sentenceId: string) => {
    if (!currentScriptData) return
    
    const sentence = currentScriptData.sentences.find(s => s.id === sentenceId)
    if (!sentence) return
    
    // CRITICAL: Ensure dialog stays open and user stays on the same page after approval
    // Don't close dialog or redirect - user should remain in Video Editor
    if (!showEditorDialog) {
      setShowEditorDialog(true)
    }
    
    // Approve video if exists and not already approved
    if (sentence.visual && !sentence.visual.approved) {
      const approvedVisual: SentenceVisual = {
        ...sentence.visual,
        approved: true,
        status: 'approved',
      }
      handleVisualUpdate(sentenceId, approvedVisual)
    }
    
    // Approve audio if exists and not already approved
    if (sentence.audio && !sentence.audio.approved) {
      const approvedAudio: SentenceAudio = {
        ...sentence.audio,
        approved: true,
        status: 'approved',
      }
      handleAudioUpdate(sentenceId, approvedAudio)
    }
    
    // Approve the sentence
    handleApproveSentence(sentenceId)
    
    toast.success('✅ Exported to Video Assembly!')
  }

  const handleVisualApprove = (sentenceId: string) => {
    // CRITICAL: Visual is already approved by handleVisualUpdate
    // Now we need to ensure both visual.approved AND sentence.approved are set
    if (!currentScriptData) return
    
    // CRITICAL: Validate sentenceId exists
    const targetSentence = currentScriptData.sentences.find(s => s.id === sentenceId)
    if (!targetSentence) {
      console.error('❌ handleVisualApprove: Sentence not found!', {
        sentenceId,
        availableIds: currentScriptData.sentences.map(s => s.id.substring(0, 8)),
      })
      return
    }
    
    // CRITICAL: Ensure dialog stays open and user stays on the same page after approval
    // Don't close dialog or redirect - user should remain in Video Editor
    if (!showEditorDialog) {
      setShowEditorDialog(true)
    }
    if (!showVisualGallery) {
      setShowVisualGallery(true)
    }
    
    // Removed verbose logging
    
    // Use functional update to ensure we're working with latest state
    setCurrentScriptData(prev => {
      if (!prev) return prev
      
      // Find the sentence and ensure visual is properly approved with all properties
      const updatedSentences = prev.sentences.map(s => {
        // CRITICAL: Strict ID matching - only update the exact sentence
        if (s.id !== sentenceId) return s
      
      // CRITICAL: Preserve ALL visual properties including videoUrl/imageUrl
      // The visual should already be updated by handleVisualUpdate, but ensure it's complete
      const existingVisual = s.visual
      if (!existingVisual) {
        console.warn('⚠️ No visual found for sentence:', sentenceId)
        return s
      }
      
      const mergedVisual: SentenceVisual = {
        ...existingVisual, // Spread first to get all properties
        approved: true, // Force approved
        status: 'approved', // Force status
        // CRITICAL: Explicitly preserve these - don't rely on spread alone
        videoUrl: existingVisual.videoUrl || undefined,
        imageUrl: existingVisual.imageUrl || undefined,
        thumbnailUrl: existingVisual.thumbnailUrl || undefined,
        // Removed videoBase64/imageBase64 - not in type definition
        mode: existingVisual.mode,
        transitionType: existingVisual.transitionType,
        subtitleSettings: existingVisual.subtitleSettings,
        // CRITICAL: Preserve prompt and subtitleText when approving
        prompt: existingVisual.prompt,
        subtitleText: existingVisual.subtitleText,
      }
      
      // Removed verbose logging
      
        return { 
          ...s, 
          visual: mergedVisual, 
          approved: true // Also approve the sentence itself
        }
      })

      const updatedScriptData: ScriptData = {
        ...prev,
        sentences: updatedSentences,
      }
      
      // Verify the update
      // Removed unused variable
      
      // CRITICAL: Save ONLY when video is approved - debounced to prevent spam
      // This is the ONLY place we save when approving
      if (onScriptUpdate) {
        // Clear existing timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
        
        // Debounce save to prevent repeated calls
        saveTimeoutRef.current = setTimeout(() => {
          setCurrentScriptData(prev => {
            if (prev && onScriptUpdate) {
              onScriptUpdate(prev)
            }
            return prev
          })
          saveTimeoutRef.current = null
        }, 2000) // 2 second debounce
      }
      
      // REMOVED: Auto-open logic - user should manually open editor
      // Auto-opening causes dialog to re-open after close, causing issues
      // Only allow manual open via button click
      toast.success('✅ Video approved!')
      
      return updatedScriptData
    })
  }
  
  const handleAudioApprove = (sentenceId: string) => {
    // CRITICAL: Ensure dialog stays open and user stays on the same page after approval
    // Don't close dialog or redirect - user should remain in Video Editor
    if (!showEditorDialog) {
      setShowEditorDialog(true)
    }
    handleCombinedApprove(sentenceId)
  }

  const handleVisualReject = (_sentenceId: string) => {
    // Visual rejected - can still approve sentence text separately
    toast.info('Video rejected. You can still approve the sentence text.')
  }

  const handleAudioUpdate = (sentenceId: string, audio: SentenceAudio) => {
    if (!currentScriptData) return

    // Check if audio actually changed to prevent unnecessary saves
    const existingAudio = currentScriptData.sentences.find(s => s.id === sentenceId)?.audio
    const audioChanged = JSON.stringify(existingAudio) !== JSON.stringify(audio)
    
    if (!audioChanged && existingAudio) {
      // No change, skip update
      return
    }

    const updatedSentences = currentScriptData.sentences.map(sentence =>
      sentence.id === sentenceId ? { ...sentence, audio } : sentence
    )

    const updatedScriptData = {
      ...currentScriptData,
      sentences: updatedSentences
    }

    setCurrentScriptData(updatedScriptData)
    
    // CRITICAL: Save when audio is generated (not just approved) - debounced to prevent spam
    // This ensures audio persists after reload
    if (onScriptUpdate && audio.audioUrl) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      // Debounce save to prevent repeated calls
      saveTimeoutRef.current = setTimeout(() => {
        setCurrentScriptData(prev => {
          if (prev && onScriptUpdate) {
            onScriptUpdate(prev)
          }
          return prev
        })
        saveTimeoutRef.current = null
      }, 2000) // 2 second debounce
    }
  }

  const handleAudioReject = (_sentenceId: string) => {
    // Audio rejected - can still approve sentence text separately
    toast.info('Audio rejected. You can still approve the sentence text.')
  }

  // Removed unused function hasApprovedAudio

  // Removed unused function handleExportPodcast

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
        className={`rounded-lg border transition-colors ${
          isSelected 
            ? 'border-primary bg-primary/5' 
            : isApproved 
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' 
              : 'border-muted'
        }`}
      >
        <div className="p-4">
          {/* Header with sentence info */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
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
            {!isApproved && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  handleApproveSentence(sentence.id)
                }}
                className="h-8"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
            )}
          </div>

          {/* Sentence text only - all editing in Final Video Editor */}
          <p className={`text-sm leading-relaxed ${
            isApproved ? 'text-green-700 dark:text-green-300' : 'text-foreground'
          }`}>
            {sentence.text}
          </p>
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
            Review and approve individual sentences. All editing (text, bullet points, subtitles, etc.) is done in the Final Video Editor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {currentScriptData.sentences.map((sentence) => (
              <div key={sentence.id || `sentence-${sentence.text?.substring(0, 10)}`}>
                {renderSentence(sentence)}
              </div>
            ))}
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
              onAudioUpdate={handleAudioUpdate}
              tables={tables}
              images={images}
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

  // REMOVED: Auto-open logic - causes dialog to re-open after close
  // User should manually open editor when needed

  return (
    <div className="space-y-6">
      {renderRichTextEditor()}
      
      {/* Video Generation Section */}
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

      {/* Audio Generation Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Audio Narration</h3>
          <p className="text-sm text-muted-foreground">
            Generate or upload audio narration for all sentences
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowAudioGallery(!showAudioGallery)}
        >
          <Volume2 className="h-4 w-4 mr-2" />
          {showAudioGallery ? 'Hide Audio' : 'Show Audio'}
        </Button>
      </div>
      
      {showAudioGallery && renderAudioGallery()}

      {/* Background Music Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Background Music</h3>
          <p className="text-sm text-muted-foreground">
            Generate or upload background music for your entire script
            {(() => {
              if (!currentScriptData) return null;
              const hasBackgroundMusic = currentScriptData.backgroundMusic && 
                (currentScriptData.backgroundMusic.audioUrl || currentScriptData.backgroundMusic.audioBase64);
              const isApproved = currentScriptData.backgroundMusic?.approved === true;
              
              if (hasBackgroundMusic && isApproved) {
                return (
                  <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                    (✓ Approved)
                  </span>
                );
              } else if (hasBackgroundMusic) {
                return (
                  <span className="ml-2 text-yellow-600 dark:text-yellow-400 font-medium">
                    (Pending Approval)
                  </span>
                );
              }
              return null;
            })()}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowBackgroundMusic(!showBackgroundMusic)}
        >
          <Music className="h-4 w-4 mr-2" />
          {showBackgroundMusic ? 'Hide Music' : 'Show Music'}
        </Button>
      </div>
      
      {showBackgroundMusic && (
        <BackgroundMusicComponent
          backgroundMusic={currentScriptData?.backgroundMusic}
          onUpdate={(music: BackgroundMusic | null) => {
            if (!currentScriptData) return;
            const updatedScriptData: ScriptData = {
              ...currentScriptData,
              backgroundMusic: music || undefined,
            };
            setCurrentScriptData(updatedScriptData);
            // Debounced save to prevent repeated calls
            if (onScriptUpdate) {
              // Clear existing timeout
              if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
              }
              
              // Debounce save to prevent repeated calls
              saveTimeoutRef.current = setTimeout(() => {
                setCurrentScriptData(prev => {
                  if (prev && onScriptUpdate) {
                    onScriptUpdate(prev)
                  }
                  return prev
                })
                saveTimeoutRef.current = null
              }, 2000) // 2 second debounce
            }
            if (music) {
              toast.success('Background music updated!')
            } else {
              toast.info('Background music removed')
            }
          }}
          totalDuration={(() => {
            if (!currentScriptData) return 90;
            // Calculate total duration from audio durations or estimate
            const totalAudioDuration = currentScriptData.sentences
              .filter(s => s.audio?.duration)
              .reduce((sum, s) => sum + (s.audio?.duration || 0), 0);
            
            if (totalAudioDuration > 0) {
              return Math.ceil(totalAudioDuration);
            }
            
            // Estimate based on sentence count (average 3 seconds per sentence)
            const estimatedDuration = currentScriptData.sentences.length * 3;
            return Math.max(30, Math.min(300, estimatedDuration)); // 30s to 5min
          })()}
          scriptContent={(() => {
            if (!currentScriptData) return '';
            // Combine all sentence texts for script content analysis
            return currentScriptData.sentences
              .map(s => s.text)
              .join(' ');
          })()}
        />
      )}
      
      {/* Video Editor Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Video Editor</h3>
          <p className="text-sm text-muted-foreground">
            Open editor to view approved videos and assemble final video
            {(() => {
              if (!currentScriptData) return null;
              const approvedVisuals = currentScriptData.sentences?.filter(s => {
                const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
                const hasVideo = !!(s.visual?.videoUrl || s.visual?.imageUrl)
                return isApproved && hasVideo
              }) || [];
              const totalApproved = approvedVisuals.length;
              
              // Debug: Log all sentences with their approval status
              // Removed verbose logging
              
              return (
                <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                  ({totalApproved} approved {totalApproved === 1 ? 'video' : 'videos'})
                </span>
              );
            })()}
          </p>
        </div>
        <Button
          variant="default"
          onClick={() => {
            // Opening Video Editor
            setShowEditorDialog(true)
          }}
          disabled={!currentScriptData}
        >
          <Film className="h-4 w-4 mr-2" />
          Open Video Editor
        </Button>
      </div>

      {/* Video Editor Dialog */}
      <Dialog 
        open={showEditorDialog} 
        onOpenChange={(open) => {
          // CRITICAL: Force close - prevent any re-open logic
          if (!open) {
            // User is closing - set flag to prevent auto-reopen
            isDialogClosingRef.current = true
            setShowEditorDialog(false)
            
            // Reset flag after delay to allow manual reopen later
            setTimeout(() => {
              isDialogClosingRef.current = false
            }, 1000)
            
            // Reset body styles when closing
            setTimeout(() => {
              document.body.style.overflow = ''
              document.body.classList.remove('overflow-hidden')
            }, 100)
          } else {
            // User is opening - only allow if not in closing state
            if (!isDialogClosingRef.current) {
              setShowEditorDialog(true)
            }
          }
        }}
      >
        <DialogContent 
          className="max-w-7xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Video Editor</DialogTitle>
            <DialogDescription>
              View approved videos and assemble final video
            </DialogDescription>
          </DialogHeader>
          {currentScriptData ? (() => {
            // Create a stable key that doesn't change on approval - only changes when videos are added/removed
            // This prevents remounting when approving, keeping user on the same page
            const visualStatesKey = currentScriptData.sentences
              .map(s => {
                // Only include video/image presence, NOT approval status (to prevent remount on approval)
                const hasVideo = s.visual?.videoUrl ? 'v' : ''
                const hasImage = s.visual?.imageUrl ? 'i' : ''
                return `${s.id}:${hasVideo}${hasImage}`
              })
              .join('|')
            
            return (
              <VideoTimelineEditor
                onVisualUpdate={handleVisualUpdate}
                onAudioUpdate={handleAudioUpdate}
                onVisualApprove={handleVisualApprove}
                onAudioApprove={handleAudioApprove}
                onScriptUpdate={(updatedScriptData) => {
                  // Update local state only - NO AUTO SAVE
                  // Final video will be saved when explicitly exported/approved
                  // Don't call parent onScriptUpdate here - it causes re-renders and closes dialog
                  setCurrentScriptData(updatedScriptData)
                  // Removed verbose logging
                }}
                paperContext={paperContext}
                key={`timeline-${currentScriptData.id || 'default'}-${visualStatesKey.substring(0, 300)}`}
                scriptData={currentScriptData}
                onVideoExport={onVideoExport}
                onExport={(videoUrl, videoBase64) => {
                  // Video marked as completed - save to session
                  if (onVideoExport) {
                    onVideoExport(videoUrl, videoBase64);
                  }
                }}
              />
            )
          })() : (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No script data available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {renderSentenceList()}
    </div>
  )
}

