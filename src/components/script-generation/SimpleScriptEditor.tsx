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
  Pause
} from 'lucide-react'
import { toast } from 'sonner'

interface Sentence {
  id: string
  text: string
  approved: boolean
  startTime?: number
  endTime?: number
}

interface ScriptData {
  script: string
  sentences: Sentence[]
  version: number
  generatedAt: string
}

interface SimpleScriptEditorProps {
  scriptData: ScriptData | null
  onApprove: (sentenceId: string) => void
  onRegenerate: () => void
  onExport: (data: ScriptData) => void
  isLoading?: boolean
}

export function SimpleScriptEditor({ 
  scriptData, 
  onApprove, 
  onRegenerate, 
  onExport, 
  isLoading = false 
}: SimpleScriptEditorProps) {
  const [selectedSentenceId, setSelectedSentenceId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentScriptData, setCurrentScriptData] = useState<ScriptData | null>(scriptData)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const editorRef = useRef<HTMLDivElement>(null)

  // Update local state when scriptData changes
  useEffect(() => {
    if (scriptData) {
      setCurrentScriptData(scriptData)
      setIsInitialLoad(true)
    }
  }, [scriptData])

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

  return (
    <div className="space-y-6">
      {renderRichTextEditor()}
      {renderSentenceList()}
    </div>
  )
}
