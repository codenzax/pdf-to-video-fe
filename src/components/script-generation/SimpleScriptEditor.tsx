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
  onScriptUpdate,
  isLoading = false,
  paperContext,
  tables,
  images
}: SimpleScriptEditorProps) {
  const [selectedSentenceId, setSelectedSentenceId] = useState<string | null>(null)
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

  // CRITICAL: Sync scriptData prop to currentScriptData - scriptData prop is source of truth
  // When parent updates scriptData (via onScriptUpdate), it flows back as prop and we sync it
  useEffect(() => {
    if (!scriptData) {
      setCurrentScriptData(null)
      return
    }
    
    // Check if scriptData actually changed by comparing sentence visual states
    const propApprovedCount = scriptData.sentences?.filter(s => {
      const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
      const hasVideo = !!(s.visual?.videoUrl || s.visual?.imageUrl)
      return isApproved && hasVideo
    }).length || 0
    const currentApprovedCount = currentScriptData?.sentences?.filter(s => {
      const isApproved = s.visual?.approved === true || s.visual?.status === 'approved'
      const hasVideo = !!(s.visual?.videoUrl || s.visual?.imageUrl)
      return isApproved && hasVideo
    }).length || 0
    
    // Create a dependency string that changes when visual approval status changes
    // Compute this inside useEffect to avoid setState during render
    const visualApprovalKey = scriptData.sentences
      ?.map(s => `${s.id}:${s.visual?.approved === true ? '1' : '0'}:${s.visual?.videoUrl ? 'v' : ''}:${s.visual?.imageUrl ? 'i' : ''}`)
      .join('|') || ''
    const currentVisualApprovalKey = currentScriptData?.sentences
      ?.map(s => `${s.id}:${s.visual?.approved === true ? '1' : '0'}:${s.visual?.videoUrl ? 'v' : ''}:${s.visual?.imageUrl ? 'i' : ''}`)
      .join('|') || ''
    
    // Always sync from prop when approved count changes or data structure changes
    // This ensures approved visuals persist when gallery is hidden/shown
    // CRITICAL: Also check if any visual approval status changed (even if count is same)
    const hasApprovalChange = scriptData.sentences?.some((s, idx) => {
      const current = currentScriptData?.sentences?.[idx]
      if (!current) return true
      const propApproved = s.visual?.approved === true || s.visual?.status === 'approved'
      const currentApproved = current.visual?.approved === true || current.visual?.status === 'approved'
      const propHasVideo = !!(s.visual?.videoUrl || s.visual?.imageUrl)
      const currentHasVideo = !!(current.visual?.videoUrl || current.visual?.imageUrl)
      return propApproved !== currentApproved || propHasVideo !== currentHasVideo
    })
    
    // CRITICAL: Don't sync if user is actively editing - wait for them to finish
    if (isUserEditingRef.current) {
      return // Skip sync while user is editing
    }
    
    // CRITICAL: Check if text changed - if currentScriptData has newer text edits, preserve them
    const hasTextChange = currentScriptData && scriptData.sentences?.some((s, idx) => {
      const current = currentScriptData.sentences?.[idx]
      return current && current.text !== s.text
    })
    
    // CRITICAL: Always preserve user's text edits from currentScriptData
    // Only sync visual/approval changes from prop, never overwrite text
    if (!currentScriptData || propApprovedCount !== currentApprovedCount || scriptData.sentences?.length !== currentScriptData.sentences?.length || hasApprovalChange || visualApprovalKey !== currentVisualApprovalKey) {
      // Merge: ALWAYS keep user's text edits from currentScriptData, update visuals from prop
      const mergedSentences = scriptData.sentences.map((propSentence, idx) => {
        const currentSentence = currentScriptData?.sentences?.[idx]
        if (currentSentence) {
          // ALWAYS preserve text from currentScriptData (user's edits)
          return {
            ...propSentence,
            text: currentSentence.text, // CRITICAL: Always use current text
            // Preserve other current properties too
            approved: currentSentence.approved,
            audio: currentSentence.audio,
            // But update visual from prop (if it changed)
            visual: propSentence.visual || currentSentence.visual
          }
        }
        return propSentence
      })
      
      setCurrentScriptData({
        ...scriptData,
        script: currentScriptData?.script || scriptData.script, // Keep user's edited script HTML
        sentences: mergedSentences
      })
    } else if (hasTextChange && currentScriptData) {
      // If only text changed (user edited), preserve ALL current data
      // Don't sync from prop if user has made text edits
      // The currentScriptData already has the latest text, so keep it
      return // Don't overwrite user's edits
    }
    
    // Update editor content when script changes (but not if user is editing)
    if (editorRef.current && !isUserEditingRef.current) {
      // Only update if the script HTML actually changed
      const currentHtml = editorRef.current.innerHTML
      if (currentScriptData && scriptData.script !== currentHtml) {
        // Only update if it's a significant change (not just whitespace)
        const currentText = editorRef.current.innerText.trim()
        const newText = scriptData.script.replace(/<[^>]*>/g, '').trim()
        if (currentText !== newText) {
          editorRef.current.innerHTML = scriptData.script
        }
      } else if (isInitialLoad) {
        editorRef.current.innerHTML = scriptData.script
        setIsInitialLoad(false)
      }
    }
  }, [scriptData, currentScriptData]) // Only depend on scriptData and currentScriptData to avoid render issues

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
    
    // CRITICAL: Save when video is generated (not just approved) - debounced to prevent spam
    // This ensures videos persist after reload, even if not approved yet
    if (onScriptUpdate && (visual.videoUrl || visual.imageUrl)) {
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

  // Combined approve function for video + audio
  // NOTE: This is used by AudioGallery, not VisualGallery
  // VisualGallery calls handleVisualUpdate directly, then onApprove which calls handleVisualApprove
  const handleCombinedApprove = (sentenceId: string) => {
    if (!currentScriptData) return
    
    const sentence = currentScriptData.sentences.find(s => s.id === sentenceId)
    if (!sentence) return
    
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
            // Create a key based on visual states to force re-render when videos are approved
            // Create a key that changes when approval status changes
            const visualStatesKey = currentScriptData.sentences
              .map(s => {
                const approved = s.visual?.approved === true || s.visual?.status === 'approved' ? '1' : '0'
                const hasVideo = s.visual?.videoUrl ? 'v' : ''
                const hasImage = s.visual?.imageUrl ? 'i' : ''
                return `${s.id}:${approved}:${hasVideo}${hasImage}`
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
                onExport={() => {
                  // Video exported
                  toast.success('✅ Video exported successfully!')
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

