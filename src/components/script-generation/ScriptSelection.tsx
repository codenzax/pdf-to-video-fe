import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { ScriptData } from '@/services/geminiService'
import { toast } from 'sonner'

interface ScriptSelectionProps {
  scripts: ScriptData[]
  onSelect: (selectedScript: ScriptData) => void
}

export function ScriptSelection({ scripts, onSelect }: ScriptSelectionProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())

  const handleSelectScript = (index: number) => {
    setSelectedIndex(index)
  }

  const toggleCardExpansion = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
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
          const isExpanded = expandedCards.has(index)
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
                {/* Full script preview with expand/collapse */}
                <div className={`space-y-2 overflow-y-auto ${isExpanded ? 'max-h-[400px]' : 'max-h-60'}`}>
                  {(isExpanded ? sentences : sentences.slice(0, 3)).map((sentence, i) => (
                    <p
                      key={i}
                      className="text-sm text-muted-foreground"
                    >
                      {sentence.text}
                    </p>
                  ))}
                </div>

                {/* Expand/Collapse button */}
                {sentences.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={(e) => toggleCardExpansion(index, e)}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Show All {sentences.length} Sentences
                      </>
                    )}
                  </Button>
                )}

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

      {/* Full script preview for selected one */}
      {selectedIndex !== null && scripts[selectedIndex] && (
        <Card className="border-primary bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Selected Script Preview
                </CardTitle>
                <CardDescription>
                  Full script text for Script {selectedIndex + 1} - Review before continuing
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {scripts[selectedIndex].sentences.map((sentence, i) => (
                <div key={i} className="p-3 rounded-lg bg-background border">
                  <div className="flex items-start gap-3">
                    <Badge variant="secondary" className="text-xs shrink-0 mt-0.5">
                      {i + 1}
                    </Badge>
                    <p className="text-sm leading-relaxed">{sentence.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total:</span>
                <div className="flex gap-4">
                  <span>{scripts[selectedIndex].sentences.length} sentences</span>
                  <span>•</span>
                  <span>{scripts[selectedIndex].script.split(' ').length} words</span>
                  <span>•</span>
                  <span>~{Math.round(scripts[selectedIndex].sentences.length * 6)} seconds</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t">
        <Button
          variant="ghost"
          onClick={() => {
            setSelectedIndex(null)
            toast.info('Selection cleared - choose a different script')
          }}
          disabled={selectedIndex === null}
        >
          Clear Selection
        </Button>
        <Button
          onClick={handleConfirmSelection}
          disabled={selectedIndex === null}
          size="lg"
          className="min-w-[200px]"
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Continue with Selected Script
        </Button>
      </div>
    </div>
  )
}

