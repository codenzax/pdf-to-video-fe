import { useState, useEffect } from 'react'
import { DashboardLayout } from "@/pages/Dashboard"
import { JsonUpload } from '@/components/script-generation/JsonUpload'
import { SimpleScriptEditor } from '@/components/script-generation/SimpleScriptEditor'
import { ScriptSelection } from '@/components/script-generation/ScriptSelection'
import { BackgroundMusicComponent } from '@/components/script-generation/BackgroundMusic'
import { geminiService, JsonData, ScriptData, BackgroundMusic } from '@/services/geminiService'
import { Button } from '@/components/ui/button'
import { Upload, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

type WorkflowStep = 'upload' | 'generating' | 'selection' | 'editing'

// Save script data to sessionStorage to prevent data loss
const SCRIPT_STORAGE_KEY = 'script_generation_data'

const saveScriptData = (data: {
  jsonData: JsonData | null
  selectedScript: ScriptData | null
  threeScripts: ScriptData[]
  currentStep: WorkflowStep
}) => {
  try {
    // Check if data is too large for sessionStorage (limit is ~5-10MB)
    const serialized = JSON.stringify(data)
    const sizeInMB = new Blob([serialized]).size / (1024 * 1024)
    
    if (sizeInMB > 5) {
      console.warn('⚠️ Script data is large:', sizeInMB.toFixed(2), 'MB')
      // Still try to save, but log warning
    }
    
    sessionStorage.setItem(SCRIPT_STORAGE_KEY, serialized)
    console.log('✅ Saved to sessionStorage:', {
      size: sizeInMB.toFixed(2) + ' MB',
      hasSelectedScript: !!data.selectedScript,
      approvedVisuals: data.selectedScript?.sentences.filter(s => s.visual?.approved).length || 0,
    })
  } catch (e: any) {
    console.error('❌ Failed to save script data:', e)
    if (e.name === 'QuotaExceededError') {
      console.error('SessionStorage quota exceeded! Data too large.')
    }
  }
}

const loadScriptData = () => {
  try {
    const saved = sessionStorage.getItem(SCRIPT_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.warn('Failed to load script data:', e)
  }
  return null
}

export default function ScriptGenerationPage() {
  // Try to restore from sessionStorage on mount
  const savedData = loadScriptData()
  
  const [jsonData, setJsonData] = useState<JsonData | null>(savedData?.jsonData || null)
  const [threeScripts, setThreeScripts] = useState<ScriptData[]>(savedData?.threeScripts || [])
  const [selectedScript, setSelectedScript] = useState<ScriptData | null>(savedData?.selectedScript || null)
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(savedData?.currentStep || 'upload')
  const [isGenerating, setIsGenerating] = useState(false)

  // Log restored data on mount
  useEffect(() => {
    if (savedData?.selectedScript) {
      console.log('📂 Restored from sessionStorage:', {
        totalSentences: savedData.selectedScript.sentences.length,
        approvedVisuals: savedData.selectedScript.sentences.filter((s: any) => s.visual?.approved).length,
        approvedAudio: savedData.selectedScript.sentences.filter((s: any) => s.audio?.approved).length,
      })
    }
  }, [])

  // Auto-save script data whenever it changes - prevents data loss on token refresh/page reload
  useEffect(() => {
    saveScriptData({
      jsonData,
      selectedScript,
      threeScripts,
      currentStep,
    })
  }, [jsonData, selectedScript, threeScripts, currentStep])

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

  const handleSelectScript = async (script: ScriptData) => {
    setSelectedScript(script)
    setCurrentStep('editing')
    toast.success('You can now edit and approve sentences. Add background music in the Background Music section above.')
  }

  const handleBackToSelection = () => {
    setCurrentStep('selection')
    setSelectedScript(null)
  }

  const handleResetToUpload = () => {
    setJsonData(null)
    setThreeScripts([])
    setSelectedScript(null)
    setCurrentStep('upload')
    sessionStorage.removeItem(SCRIPT_STORAGE_KEY)
    toast.info('Reset complete - upload a new JSON file to start over')
  }

  const handleRegenerateAllScripts = async () => {
    if (!jsonData) {
      toast.error('No JSON data available')
      return
    }

    setThreeScripts([])
    setSelectedScript(null)
    
    // Generate new scripts
    await handleGenerateScript()
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

    const updatedScript = {
      ...selectedScript,
      sentences: updatedSentences
    }

    setSelectedScript(updatedScript)
    // State will auto-save via useEffect
  }

  const handleScriptUpdate = (updatedScript: ScriptData) => {
    // Sync visual/audio updates back to parent state for persistence
    console.log('💾 Saving approved state to sessionStorage...', {
      approvedVisuals: updatedScript.sentences.filter(s => s.visual?.approved).length,
      approvedAudio: updatedScript.sentences.filter(s => s.audio?.approved).length,
      hasBackgroundMusic: !!updatedScript.backgroundMusic,
      backgroundMusicApproved: updatedScript.backgroundMusic?.approved,
    })
    setSelectedScript(updatedScript)
    // IMMEDIATELY save to sessionStorage (don't wait for useEffect)
    saveScriptData({
      jsonData,
      selectedScript: updatedScript, // Use updated script directly
      threeScripts,
      currentStep,
    })
  }

  const handleBackgroundMusicUpdate = (music: BackgroundMusic | null) => {
    if (!selectedScript) return

    const updatedScript: ScriptData = {
      ...selectedScript,
      backgroundMusic: music || undefined,
    }

    handleScriptUpdate(updatedScript)
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
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold">Select Your Script</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose from the generated scripts or regenerate for new options
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleResetToUpload}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    New JSON
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleRegenerateAllScripts}
                    disabled={isGenerating}
                    className="flex items-center gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {isGenerating ? 'Generating...' : 'Regenerate Scripts'}
                  </Button>
                </div>
              </div>
              <ScriptSelection 
                scripts={threeScripts}
                onSelect={handleSelectScript}
              />
            </div>
          )}

          {/* Script Editor Section */}
          {currentStep === 'editing' && selectedScript && (
            <div className="space-y-6">
              {/* Background Music Section */}
              <div className="rounded-lg border bg-card p-6">
                <BackgroundMusicComponent
                  backgroundMusic={selectedScript.backgroundMusic}
                  onUpdate={handleBackgroundMusicUpdate}
                  totalDuration={selectedScript.sentences.reduce((acc, s) => acc + (s.endTime || 6) - (s.startTime || 0), 0) || 90}
                />
              </div>

              {/* Script Editor */}
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
                  onScriptUpdate={handleScriptUpdate}
                  isLoading={isGenerating}
                  paperContext={jsonData ? JSON.stringify({
                    title: jsonData.metadata?.title,
                    authors: jsonData.metadata?.authors,
                    keywords: jsonData.metadata?.keywords,
                  }) : undefined}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
