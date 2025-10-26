import React, { useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  RotateCcw, 
  CheckCircle, 
  Download, 
  Copy,
  Play,
  Pause,
  Highlighter
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

interface TipTapScriptEditorProps {
  scriptData: ScriptData | null
  onApprove: (sentenceId: string) => void
  onRegenerate: () => void
  onExport: (data: ScriptData) => void
  isLoading?: boolean
}

export function TipTapScriptEditor({ 
  scriptData, 
  onApprove, 
  onRegenerate, 
  onExport, 
  isLoading = false 
}: TipTapScriptEditorProps) {
  const [selectedSentenceId, setSelectedSentenceId] = React.useState<string | null>(null)
  const [isPlaying, setIsPlaying] = React.useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content: scriptData?.script || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[200px] p-4',
      },
    },
    onUpdate: () => {
      // Update script data when content changes
      // Content changes are handled by the parent component
    },
  })

  // Update editor content when scriptData changes
  useEffect(() => {
    if (editor && scriptData) {
      editor.commands.setContent(scriptData.script)
    }
  }, [editor, scriptData])

  const handleFormatText = useCallback((command: string) => {
    if (!editor) return
    
    switch (command) {
      case 'bold':
        editor.chain().focus().toggleBold().run()
        break
      case 'italic':
        editor.chain().focus().toggleItalic().run()
        break
      case 'underline':
        editor.chain().focus().toggleUnderline().run()
        break
      case 'strike':
        editor.chain().focus().toggleStrike().run()
        break
      case 'code':
        editor.chain().focus().toggleCode().run()
        break
      case 'highlight':
        editor.chain().focus().toggleHighlight().run()
        break
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run()
        break
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run()
        break
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run()
        break
      case 'undo':
        editor.chain().focus().undo().run()
        break
      case 'redo':
        editor.chain().focus().redo().run()
        break
    }
  }, [editor])

  const handleSentenceClick = (sentenceId: string) => {
    setSelectedSentenceId(sentenceId)
  }

  const handleApproveSentence = (sentenceId: string) => {
    onApprove(sentenceId)
    toast.success('Sentence approved')
  }

  const handleCopyScript = () => {
    if (editor) {
      const text = editor.getText()
      navigator.clipboard.writeText(text)
      toast.success('Script copied to clipboard')
    }
  }

  const handleExportScript = () => {
    if (scriptData && editor) {
      const updatedScriptData = {
        ...scriptData,
        script: editor.getHTML()
      }
      onExport(updatedScriptData)
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
              <span className={`text-xs px-2 py-1 rounded-full ${
                isApproved 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
              }`}>
                {isApproved ? 'Approved' : 'Pending'}
              </span>
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
    if (!scriptData) return null

    return (
      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Script Editor</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-1 bg-muted rounded-full">Version {scriptData.version}</span>
                <span className="text-sm text-muted-foreground">
                  Generated {new Date(scriptData.generatedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          
          {/* Toolbar */}
          <div className="flex items-center gap-1 p-2 border rounded-lg bg-muted/20 mb-4 flex-wrap">
            {/* Text Formatting */}
            <Button
              size="sm"
              variant={editor?.isActive('bold') ? 'default' : 'outline'}
              onClick={() => handleFormatText('bold')}
              className="h-8 w-8 p-0"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={editor?.isActive('italic') ? 'default' : 'outline'}
              onClick={() => handleFormatText('italic')}
              className="h-8 w-8 p-0"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={editor?.isActive('underline') ? 'default' : 'outline'}
              onClick={() => handleFormatText('underline')}
              className="h-8 w-8 p-0"
            >
              <Underline className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={editor?.isActive('strike') ? 'default' : 'outline'}
              onClick={() => handleFormatText('strike')}
              className="h-8 w-8 p-0"
            >
              <Strikethrough className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={editor?.isActive('code') ? 'default' : 'outline'}
              onClick={() => handleFormatText('code')}
              className="h-8 w-8 p-0"
            >
              <Code className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={editor?.isActive('highlight') ? 'default' : 'outline'}
              onClick={() => handleFormatText('highlight')}
              className="h-8 w-8 p-0"
            >
              <Highlighter className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Lists */}
            <Button
              size="sm"
              variant={editor?.isActive('bulletList') ? 'default' : 'outline'}
              onClick={() => handleFormatText('bulletList')}
              className="h-8 w-8 p-0"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={editor?.isActive('orderedList') ? 'default' : 'outline'}
              onClick={() => handleFormatText('orderedList')}
              className="h-8 w-8 p-0"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={editor?.isActive('blockquote') ? 'default' : 'outline'}
              onClick={() => handleFormatText('blockquote')}
              className="h-8 w-8 p-0"
            >
              <Quote className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* History */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFormatText('undo')}
              disabled={!editor?.can().undo()}
              className="h-8 w-8 p-0"
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFormatText('redo')}
              disabled={!editor?.can().redo()}
              className="h-8 w-8 p-0"
            >
              <Redo className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Playback */}
            <Button
              size="sm"
              variant="outline"
              onClick={togglePlayback}
              className="h-8 w-8 p-0"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </div>

          {/* Editor */}
          <div className="border rounded-lg min-h-[200px] focus-within:ring-2 focus-within:ring-primary/20">
            <EditorContent editor={editor} />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t mt-4">
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
        </div>
      </div>
    )
  }

  const renderSentenceList = () => {
    if (!scriptData || scriptData.sentences.length === 0) return null

    const approvedCount = scriptData.sentences.filter(s => s.approved).length
    const totalCount = scriptData.sentences.length

    return (
      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Sentence Management</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Review and approve individual sentences. Approved sentences will be included in the final script.
              </p>
            </div>
            <span className="text-xs px-2 py-1 bg-muted rounded-full">
              {approvedCount}/{totalCount} approved
            </span>
          </div>
          
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {scriptData.sentences.map(renderSentence)}
          </div>
        </div>
      </div>
    )
  }

  if (!scriptData) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="p-8 text-center">
          <p className="text-muted-foreground">
            Upload a JSON file and generate a script to start editing.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {renderRichTextEditor()}
      {renderSentenceList()}
    </div>
  )
}
