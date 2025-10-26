import { useState } from "react";
import { DashboardLayout } from "@/pages/Dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Upload,
  ArrowRight,
  Eye,
  Code,
  RotateCcw,
  X,
  Home,
} from "lucide-react";
import { toast } from "sonner";
import { grobidApi, CompleteExtractedData, LLMExtractionResponse } from '@/services/grobidApi';
import { geminiService, ScriptData } from '@/services/geminiService';
import { ScriptSelection } from '@/components/script-generation/ScriptSelection';
import { SimpleScriptEditor } from '@/components/script-generation/SimpleScriptEditor';

interface ProcessingStep {
  id: string;
  title: string;
  status: "pending" | "processing" | "completed" | "error";
  description: string;
}

type WorkflowStep = 'upload' | 'extract' | 'preview' | 'script-selection' | 'script-editing';

export default function PdfToVideoPage() {
  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');

  // PDF Upload & Extraction state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<CompleteExtractedData | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Script Generation state
  const [threeScripts, setThreeScripts] = useState<ScriptData[]>([]);
  const [selectedScript, setSelectedScript] = useState<ScriptData | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  const steps: ProcessingStep[] = [
    {
      id: "upload",
      title: "File Upload",
      status: uploadedFile ? "completed" : "pending",
      description: "Upload and validate PDF file",
    },
    {
      id: "llm",
      title: "LLM Processing",
      status: "pending",
      description: "Extract data using advanced LLM",
    },
    {
      id: "metadata",
      title: "Metadata Extraction",
      status: "pending",
      description: "Extract title, authors, journal info",
    },
    {
      id: "sections",
      title: "Sections Extraction",
      status: "pending",
      description: "Extract abstract, methodology, results, etc.",
    },
    {
      id: "complete",
      title: "Complete",
      status: "pending",
      description: "Finalize extraction and prepare data",
    },
  ];

  const handleFileUpload = (file: File | null) => {
    setUploadedFile(file);
    setError(null);
    setExtractedData(null);
    setSessionId(null);
    setThreeScripts([]);
    setSelectedScript(null);

    if (file) {
      setCurrentStep('extract');
    } else {
      setCurrentStep('upload');
    }

    // Update the first step status
    setProcessingSteps((prev) =>
      prev.map((step) =>
        step.id === "upload" ? { ...step, status: file ? "completed" as const : "pending" as const } : step
      )
    );
  };

  const handleResetWorkflow = () => {
    setUploadedFile(null);
    setExtractedData(null);
    setSessionId(null);
    setThreeScripts([]);
    setSelectedScript(null);
    setProcessingSteps([]);
    setError(null);
    setCurrentStep('upload');
    toast.info('Workflow reset - start over with a new PDF');
  };

  const handleReExtract = async () => {
    if (!uploadedFile) {
      toast.error('No PDF file available');
      return;
    }

    setExtractedData(null);
    setSessionId(null);
    setThreeScripts([]);
    setSelectedScript(null);
    setProcessingSteps([]);
    setError(null);

    // Automatically start re-extraction
    await startProcessing();
  };

  const handleRegenerateScripts = () => {
    setThreeScripts([]);
    setSelectedScript(null);
    toast.info('Generate new script variations');
  };

  const startProcessing = async () => {
    if (!uploadedFile) {
      toast.error("Please upload a PDF file first");
      return;
    }

    setIsProcessing(true);
    setProcessingSteps(steps);
    setError(null);

    try {
      // Step 1: LLM Processing
      setProcessingSteps((prev) =>
        prev.map((step) =>
          step.id === "llm"
            ? { ...step, status: "processing" as const }
            : step
        )
      );

      toast.info("Starting LLM extraction...");

      const response: LLMExtractionResponse = await grobidApi.extractCompleteData(uploadedFile);

      if (response.status === "success") {
        setExtractedData(response.data.extractedData);
        setSessionId(response.data.sessionId);

        // Mark all steps as completed
        setProcessingSteps((prev) =>
          prev.map((step) => ({ ...step, status: "completed" as const }))
        );

        toast.success("LLM extraction completed successfully!");
        setCurrentStep('preview');
      } else {
        throw new Error(response.message || 'Extraction failed');
      }

    } catch (error) {
      console.error("Processing error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`Extraction failed: ${errorMessage}`);

      setProcessingSteps((prev) =>
        prev.map((step) =>
          step.status === "processing"
            ? { ...step, status: "error" as const }
            : step
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateScripts = async () => {
    if (!extractedData) {
      toast.error('No extracted data available');
      return;
    }

    setIsGeneratingScript(true);
    try {
      // Convert extractedData to JsonData format
      const jsonData = {
        metadata: {
          ...extractedData.metadata,
          abstract: extractedData.sections.abstract
        },
        sections: extractedData.sections,
        tables: extractedData.tables.map(t => ({ caption: t.title, data: t.data })),
        images: extractedData.images.map(i => ({ caption: i.title, description: i.description }))
      };

      const scripts = await geminiService.generate3Scripts(jsonData);
      setThreeScripts(scripts);
      setCurrentStep('script-selection');
      toast.success('3 scripts generated successfully!');
    } catch (error) {
      console.error('Error generating scripts:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate scripts');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleSelectScript = (script: ScriptData) => {
    setSelectedScript(script);
    setCurrentStep('script-editing');
    toast.success('You can now edit and approve sentences');
  };

  const handleBackToSelection = () => {
    setCurrentStep('script-selection');
    setSelectedScript(null);
  };

  const handleRegenerateScript = async () => {
    if (!extractedData || !selectedScript) {
      toast.error('Missing data for regeneration');
      return;
    }

    setIsGeneratingScript(true);
    try {
      const jsonData = {
        metadata: {
          ...extractedData.metadata,
          abstract: extractedData.sections.abstract
        },
        sections: extractedData.sections,
        tables: extractedData.tables.map(t => ({ caption: t.title, data: t.data })),
        images: extractedData.images.map(i => ({ caption: i.title, description: i.description }))
      };

      const regeneratedScript = await geminiService.regenerateUnapprovedSentences(jsonData, selectedScript);
      setSelectedScript(regeneratedScript);
      toast.success('Unapproved sentences regenerated successfully!');
    } catch (error) {
      console.error('Error regenerating script:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate script');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleApproveSentence = (sentenceId: string) => {
    if (!selectedScript) return;

    const updatedSentences = selectedScript.sentences.map(sentence =>
      sentence.id === sentenceId ? { ...sentence, approved: true } : sentence
    );

    setSelectedScript({
      ...selectedScript,
      sentences: updatedSentences
    });
  };

  const handleExportScript = (data: ScriptData) => {
    const paperTitle = extractedData?.metadata?.title || 'Untitled Paper';
    const exportData = geminiService.exportScript(data, paperTitle);
    geminiService.downloadScript(exportData);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const downloadData = () => {
    if (extractedData) {
      const dataStr = JSON.stringify(extractedData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `extracted_data_${sessionId || 'unknown'}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Data downloaded successfully!');
    }
  };

  const getStepIcon = (status: ProcessingStep["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "processing":
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
        );
    }
  };

  // Step indicator component
  const StepIndicator = ({ step, label, status }: { step: number; label: string; status: 'completed' | 'current' | 'pending' }) => (
    <div className="flex items-center">
      <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
        status === 'completed' ? 'bg-green-600 border-green-600 text-white' :
        status === 'current' ? 'bg-primary border-primary text-white' :
        'bg-muted border-muted-foreground text-muted-foreground'
      }`}>
        {status === 'completed' ? <CheckCircle className="h-5 w-5" /> : step}
      </div>
      <span className={`ml-2 text-sm font-medium ${
        status === 'current' ? 'text-foreground' : 'text-muted-foreground'
      }`}>{label}</span>
    </div>
  );

  const getStepStatus = (stepName: WorkflowStep): 'completed' | 'current' | 'pending' => {
    const stepOrder: WorkflowStep[] = ['upload', 'extract', 'preview', 'script-selection', 'script-editing'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepName);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">PDF to Video Workflow</h1>
          <p className="text-muted-foreground">
            Complete workflow: Upload PDF → Extract Data → Generate Script → Edit & Export
          </p>
        </div>

        {/* Step Progress Indicator */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center flex-1">
                <StepIndicator step={1} label="Upload PDF" status={getStepStatus('upload')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={2} label="Extract Data" status={getStepStatus('extract')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={3} label="Preview Data" status={getStepStatus('preview')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={4} label="Select Script" status={getStepStatus('script-selection')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={5} label="Edit Script" status={getStepStatus('script-editing')} />
              </div>
              {currentStep !== 'upload' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetWorkflow}
                  className="ml-4"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Start Over
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* STEP 1 & 2: Upload and Extract */}
        {(currentStep === 'upload' || currentStep === 'extract') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {currentStep === 'upload' ? 'Step 1: Upload PDF' : 'Step 2: Extract Data'}
              </CardTitle>
              <CardDescription>
                {currentStep === 'upload'
                  ? 'Select an academic PDF file to begin the workflow'
                  : 'Extract academic data from your PDF using LLM processing'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload Section */}
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (file && file.type === 'application/pdf') {
                      handleFileUpload(file);
                    } else {
                      toast.error('Please select a valid PDF file');
                    }
                  }}
                  className="hidden"
                  id="file-upload"
                  accept=".pdf"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center space-y-4"
                >
                  <div className="p-3 rounded-full bg-muted">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">
                      Upload PDF File
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Click to select a PDF file for processing
                    </p>
                  </div>
                  {/* <Button variant="outline" size="sm" type="button">
                    Choose PDF File
                  </Button> */}
                </label>
              </div>

              {/* Uploaded File Info */}
              {uploadedFile && (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={startProcessing}
                      disabled={isProcessing}
                      size="sm"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Start Extraction'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFileUpload(null)}
                      disabled={isProcessing}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}

              {/* Processing Steps */}
              {processingSteps.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  {processingSteps.map((step) => (
                    <div key={step.id} className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {getStepIcon(step.status)}
                      </div>
                      <div className="flex-1">
                        <p
                          className={`text-sm font-medium ${
                            step.status === "completed"
                              ? "text-green-600"
                              : step.status === "processing"
                                ? "text-blue-600"
                                : step.status === "error"
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                          }`}
                        >
                          {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="space-y-3">
                  <div className="flex items-start space-x-2 p-3 border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">Processing Error</p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">{error}</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleReExtract}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retry Extraction
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 3: Preview Extracted Data */}
        {currentStep === 'preview' && extractedData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Step 3: Preview Extracted Data
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReExtract}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Re-extract
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(extractedData, null, 2))}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadData}
                  >
                    <Code className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                Review the extracted data or re-extract if needed before generating scripts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Tabs for Data and JSON view */}
              <Tabs defaultValue="data" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="data">Formatted Data</TabsTrigger>
                  <TabsTrigger value="json">Raw JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="data" className="space-y-4 mt-4">
                  {/* Metadata Section */}
                  <div className="space-y-3 p-4 border rounded-lg">
                    <h4 className="text-lg font-semibold">Paper Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Title</h5>
                        <p className="text-sm mt-1">{extractedData.metadata.title}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Authors</h5>
                        <p className="text-sm mt-1">
                          {extractedData.metadata.authors.map(a => `${a.firstName} ${a.lastName}`).join(', ')}
                        </p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Journal</h5>
                        <p className="text-sm mt-1">{extractedData.metadata.journal || 'N/A'}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Year</h5>
                        <p className="text-sm mt-1">{extractedData.metadata.year || 'N/A'}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">DOI</h5>
                        <p className="text-sm mt-1">{extractedData.metadata.doi || 'N/A'}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Keywords</h5>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {extractedData.metadata.keywords.map((keyword, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{keyword}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sections Display */}
                  <div className="space-y-3 p-4 border rounded-lg">
                    <h4 className="text-lg font-semibold">Academic Sections</h4>
                    <div className="space-y-3">
                      {Object.entries(extractedData.sections).map(([sectionName, content]) => (
                        <div key={sectionName} className="border rounded-lg p-3 bg-muted/20">
                          <h5 className="font-medium capitalize mb-2 text-sm">{sectionName}</h5>
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {content || 'No content available'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tables and Images Summary */}
                  {(extractedData.tables.length > 0 || extractedData.images.length > 0) && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border">
                      <h4 className="font-medium text-sm mb-2">Additional Data</h4>
                      <p className="text-xs text-muted-foreground">
                        {extractedData.tables.length > 0 && `${extractedData.tables.length} table(s) `}
                        {extractedData.images.length > 0 && `${extractedData.images.length} image(s) `}
                        included in the data
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="json" className="mt-4">
                  <div className="relative">
                    <div className="bg-slate-950 p-4 rounded-lg max-h-[500px] overflow-auto">
                      <pre className="text-xs text-slate-100 font-mono whitespace-pre-wrap break-words">
                        <code className="language-json">{JSON.stringify(extractedData, null, 2)}</code>
                      </pre>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700"
                      onClick={() => {
                        copyToClipboard(JSON.stringify(extractedData, null, 2));
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Action Buttons */}
              <div className="pt-4 border-t flex gap-2">
                <Button
                  onClick={handleReExtract}
                  variant="outline"
                  disabled={isGeneratingScript}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject & Re-extract
                </Button>
                <Button
                  onClick={handleGenerateScripts}
                  disabled={isGeneratingScript}
                  size="lg"
                  className="flex-[2]"
                >
                  {isGeneratingScript ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating 3 Scripts...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Accept & Generate Scripts
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 4: Script Selection */}
        {currentStep === 'script-selection' && threeScripts.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Step 4: Select Your Script</CardTitle>
                  <CardDescription>
                    Choose from 3 generated script variations or regenerate for new options
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    handleRegenerateScripts();
                    await handleGenerateScripts();
                  }}
                  disabled={isGeneratingScript}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Regenerate All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScriptSelection
                scripts={threeScripts}
                onSelect={handleSelectScript}
              />
            </CardContent>
          </Card>
        )}

        {/* STEP 5: Script Editor */}
        {currentStep === 'script-editing' && selectedScript && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Step 5: Edit & Approve Script</CardTitle>
                    <CardDescription>
                      Review, edit, and approve your final script
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={handleBackToSelection}>
                    ← Back to Selection
                  </Button>
                </div>
              </CardHeader>
            </Card>
            <SimpleScriptEditor
              scriptData={selectedScript}
              onApprove={handleApproveSentence}
              onRegenerate={handleRegenerateScript}
              onExport={handleExportScript}
              isLoading={isGeneratingScript}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}