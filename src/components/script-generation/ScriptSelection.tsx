import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, FileText } from 'lucide-react'
import { ScriptData } from '@/services/geminiService'
import { toast } from 'sonner'

interface ScriptSelectionProps {
  scripts: ScriptData[]
  onSelect: (selectedScript: ScriptData) => void
}

export function ScriptSelection({ scripts, onSelect }: ScriptSelectionProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const handleSelectScript = (index: number) => {
    setSelectedIndex(index)
  }

  const handleConfirmSelection = () => {
    if (selectedIndex === null) {
      toast.error('Please select a script to continue')
      return
    }

    onSelect(scripts[selectedIndex])
    toast.success('Script selected successfully!')
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Select Your Script</h2>
        <p className="text-muted-foreground">
          We've generated 3 different script variations. Review and select the one that best fits your needs.
        </p>
      </div>

      {/* Script Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {scripts.map((script, index) => {
          const isSelected = selectedIndex === index
          const sentences = script.sentences || []

          return (
            <Card
              key={index}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                isSelected
                  ? 'border-primary border-2 shadow-md'
                  : 'border-muted'
              }`}
              onClick={() => handleSelectScript(index)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Script {index + 1}</CardTitle>
                  {isSelected && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
                <CardDescription>
                  {sentences.length} sentences • {Math.round(sentences.length * 6)} seconds
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Preview of first few sentences */}
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {sentences.slice(0, 3).map((sentence, i) => (
                    <p
                      key={i}
                      className="text-sm text-muted-foreground line-clamp-3"
                    >
                      {sentence.text}
                    </p>
                  ))}
                  {sentences.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{sentences.length - 3} more sentences
                    </p>
                  )}
                </div>

                {/* Word count */}
                <div className="pt-2 border-t">
                  <Badge variant="outline" className="text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    {script.script.split(' ').length} words
                  </Badge>
                </div>

                {/* Selection indicator */}
                {isSelected && (
                  <div className="pt-2 border-t">
                    <Badge className="w-full justify-center">
                      Selected
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => toast.info('Scroll up to review all scripts')}
        >
          Need More Info
        </Button>
        <Button
          onClick={handleConfirmSelection}
          disabled={selectedIndex === null}
          className="min-w-[150px]"
        >
          Continue with Selected Script
        </Button>
      </div>

      {/* Full script preview for selected one */}
      {selectedIndex !== null && scripts[selectedIndex] && (
        <Card className="mt-6 border-primary">
          <CardHeader>
            <CardTitle>Selected Script Preview</CardTitle>
            <CardDescription>
              Full script text for Script {selectedIndex + 1}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {scripts[selectedIndex].sentences.map((sentence, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/30">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {i + 1}
                    </Badge>
                    <p className="text-sm leading-relaxed">{sentence.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

