import { useState } from 'react'
import { DashboardLayout } from "@/pages/Dashboard"
import { JsonUpload } from '@/components/script-generation/JsonUpload'
import { SimpleScriptEditor } from '@/components/script-generation/SimpleScriptEditor'
import { ScriptSelection } from '@/components/script-generation/ScriptSelection'
import { geminiService, JsonData, ScriptData } from '@/services/geminiService'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type WorkflowStep = 'upload' | 'generating' | 'selection' | 'editing'

export default function ScriptGenerationPage() {
  const [jsonData, setJsonData] = useState<JsonData | null>(null)
  const [threeScripts, setThreeScripts] = useState<ScriptData[]>([])
  const [selectedScript, setSelectedScript] = useState<ScriptData | null>(null)
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleJsonLoaded = (data: JsonData) => {
    setJsonData(data)
    setThreeScripts([])
    setSelectedScript(null)
    setCurrentStep('upload')
  }

  const handleGenerateScript = async () => {
    if (!jsonData) {
      toast.error('Please upload a JSON file first')
      return
    }

    setIsGenerating(true)
    setCurrentStep('generating')
    
    try {
      const scripts = await geminiService.generate3Scripts(jsonData)
      setThreeScripts(scripts)
      setCurrentStep('selection')
      toast.success('3 scripts generated successfully!')
    } catch (error) {
      console.error('Error generating scripts:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate scripts')
      setCurrentStep('upload')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSelectScript = (script: ScriptData) => {
    setSelectedScript(script)
    setCurrentStep('editing')
    toast.success('You can now edit and approve sentences')
  }

  const handleBackToSelection = () => {
    setCurrentStep('selection')
    setSelectedScript(null)
  }

  const handleRegenerateScript = async () => {
    if (!jsonData) {
      toast.error('No JSON data available')
      return
    }

    if (!selectedScript) {
      toast.error('No script to regenerate')
      return
    }

    setIsGenerating(true)
    try {
      const regeneratedScript = await geminiService.regenerateUnapprovedSentences(jsonData, selectedScript)
      setSelectedScript(regeneratedScript)
      toast.success('Unapproved sentences regenerated successfully!')
    } catch (error) {
      console.error('Error regenerating script:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate script')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleApproveSentence = (sentenceId: string) => {
    if (!selectedScript) return

    const updatedSentences = selectedScript.sentences.map(sentence =>
      sentence.id === sentenceId ? { ...sentence, approved: true } : sentence
    )

    setSelectedScript({
      ...selectedScript,
      sentences: updatedSentences
    })
  }

  const handleExportScript = (data: ScriptData) => {
    const paperTitle = jsonData?.metadata?.title || 'Untitled Paper'
    const exportData = geminiService.exportScript(data, paperTitle)
    geminiService.downloadScript(exportData)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Script Generation</h1>
          <p className="text-muted-foreground">
            Generate and edit narration scripts from extracted JSON.
          </p>
        </div>

        {/* Main Content */}
        <div className="grid gap-6">
          {/* JSON Upload Section - Only show when at upload step */}
          {(currentStep === 'upload' || currentStep === 'generating') && (
            <div className="rounded-lg border bg-card p-6">
              <h2 className="text-xl font-semibold mb-4">Upload JSON File</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Upload a structured JSON file extracted from PDF to generate a 90-second narration script.
              </p>
              <JsonUpload 
                onJsonLoaded={handleJsonLoaded}
                onGenerateScript={handleGenerateScript}
                isLoading={isGenerating || currentStep === 'generating'}
              />
            </div>
          )}

          {/* Script Selection Section */}
          {currentStep === 'selection' && (
            <div className="rounded-lg border bg-card p-6">
              <ScriptSelection 
                scripts={threeScripts}
                onSelect={handleSelectScript}
              />
            </div>
          )}

          {/* Script Editor Section */}
          {currentStep === 'editing' && selectedScript && (
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Script Editor</h2>
                  <p className="text-sm text-muted-foreground">
                    Edit and approve your generated script with rich text formatting.
                  </p>
                </div>
                <Button variant="outline" onClick={handleBackToSelection}>
                  ← Back to Selection
                </Button>
              </div>
              <SimpleScriptEditor
                scriptData={selectedScript}
                onApprove={handleApproveSentence}
                onRegenerate={handleRegenerateScript}
                onExport={handleExportScript}
                isLoading={isGenerating}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
