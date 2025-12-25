import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Sentence } from '@/services/geminiService'
import { SlidePreview } from './SlidePreview'

interface SentenceEditorProps {
  sentence: Sentence
  onUpdate: (updatedSentence: Sentence) => void
  backgroundImageUrl?: string
}

export function SentenceEditor({ sentence, onUpdate: _onUpdate, backgroundImageUrl }: SentenceEditorProps) {
  const [scriptText, setScriptText] = useState(sentence.text || '')
  const [presentationText, setPresentationText] = useState<string[]>(
    sentence.presentation_text || []
  )

  // Sync with prop changes
  useEffect(() => {
    setScriptText(sentence.text || '')
    setPresentationText(sentence.presentation_text || [])
  }, [sentence.text, sentence.presentation_text])

  // Create sentence with current presentation_text for preview
  const sentenceWithPresentationText: Sentence = {
    ...sentence,
    text: scriptText,
    presentation_text: presentationText.length > 0 ? presentationText : undefined,
  }

  return (
    <div className="space-y-4">
      {/* Slide Preview Section */}
      <div>
        <Label className="text-base font-semibold mb-2 block">Slide Preview</Label>
        <SlidePreview
          sentence={sentenceWithPresentationText}
          backgroundImageUrl={backgroundImageUrl}
        />
      </div>

      {/* Generated Scripts Section - Read-only display only */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Scripts</CardTitle>
          <p className="text-xs text-muted-foreground mt-2">
            Script text and bullet points can be edited in the Final Video Editor
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Script Text (Read-only) */}
          <div className="space-y-2">
            <Label>Script Text (Speaking use / Subtitles)</Label>
            <div className="p-3 bg-muted/50 rounded-md border border-border min-h-[100px]">
              <p className="text-sm text-foreground whitespace-pre-wrap">{scriptText || 'No script text available'}</p>
            </div>
          </div>

          {/* Presentation Text (Read-only) */}
          <div className="space-y-2">
            <Label>Presentation Text (Viewing use / Slide text)</Label>
            {presentationText.length > 0 ? (
              <div className="p-3 bg-muted/50 rounded-md border border-border space-y-2">
                {presentationText.map((bullet, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-sm font-semibold text-muted-foreground mt-0.5">•</span>
                    <p className="text-sm text-foreground flex-1">{bullet}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-muted/50 rounded-md border border-border min-h-[100px]">
                <p className="text-sm text-muted-foreground">No presentation text available</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
