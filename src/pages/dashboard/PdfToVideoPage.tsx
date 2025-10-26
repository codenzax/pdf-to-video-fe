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
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { grobidApi, CompleteExtractedData, LLMExtractionResponse } from '@/services/grobidApi';

interface ProcessingStep {
  id: string;
  title: string;
  status: "pending" | "processing" | "completed" | "error";
  description: string;
}

export default function PdfToVideoPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<CompleteExtractedData | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    
    // Update the first step status
    setProcessingSteps((prev) =>
      prev.map((step) =>
        step.id === "upload" ? { ...step, status: file ? "completed" as const : "pending" as const } : step
      )
    );
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

  const formatExtractedData = (data: CompleteExtractedData) => {
    let result = `=== METADATA ===\n`;
    result += `Title: ${data.metadata.title}\n`;
    result += `Authors: ${data.metadata.authors.map(a => `${a.firstName} ${a.lastName}`).join(', ')}\n`;
    result += `Journal: ${data.metadata.journal || 'N/A'}\n`;
    result += `Year: ${data.metadata.year || 'N/A'}\n`;
    result += `DOI: ${data.metadata.doi || 'N/A'}\n`;
    result += `Keywords: ${data.metadata.keywords.join(', ')}\n\n`;
    
    result += `=== SECTIONS ===\n`;
    Object.entries(data.sections).forEach(([sectionName, content]) => {
      result += `\n${sectionName.toUpperCase()}:\n${content}\n`;
    });
    
    // Note: Tables and Images are included in JSON download but not displayed in UI
    if (data.tables.length > 0) {
      result += `\n=== TABLES (${data.tables.length} found) ===\n`;
      result += `Tables are included in the JSON download file.\n`;
    }
    
    if (data.images.length > 0) {
      result += `\n=== IMAGES (${data.images.length} found) ===\n`;
      result += `Images are included in the JSON download file.\n`;
    }
    
    return result;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">PDF to Video Converter</h1>
          <p className="text-muted-foreground">
            Upload academic PDFs and extract complete data using advanced LLM processing.
          </p>
        </div>

        {/* Processing Steps */}
        {processingSteps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Processing Steps</CardTitle>
                <CardDescription>
                  Track the progress of your PDF processing
                </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {processingSteps.map((step, index) => (
                  <div key={step.id} className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      {getStepIcon(step.status)}
                    </div>
                    <div className="flex-1 min-w-0">
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
                    {index < processingSteps.length - 1 && (
                      <div className="h-px bg-border flex-1 mx-4" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm font-medium">Processing Error</p>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Metadata Display */}
        {extractedData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Paper Metadata
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(formatExtractedData(extractedData))}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All Data
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadData}
                  >
                    Download Complete JSON
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                LLM extracted metadata and sections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Metadata Section */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Paper Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-sm text-muted-foreground">Title</h5>
                    <p className="text-sm">{extractedData.metadata.title}</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-sm text-muted-foreground">Authors</h5>
                    <p className="text-sm">{extractedData.metadata.authors.map(a => `${a.firstName} ${a.lastName}`).join(', ')}</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-sm text-muted-foreground">Journal</h5>
                    <p className="text-sm">{extractedData.metadata.journal || 'N/A'}</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-sm text-muted-foreground">Year</h5>
                    <p className="text-sm">{extractedData.metadata.year || 'N/A'}</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-sm text-muted-foreground">DOI</h5>
                    <p className="text-sm">{extractedData.metadata.doi || 'N/A'}</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-sm text-muted-foreground">Keywords</h5>
                    <p className="text-sm">{extractedData.metadata.keywords.join(', ')}</p>
                  </div>
                </div>
              </div>

              {/* Sections Display */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold">Academic Sections</h4>
                <div className="space-y-4">
                  {Object.entries(extractedData.sections).map(([sectionName, content]) => (
                    <div key={sectionName} className="border rounded-lg p-4">
                      <h5 className="font-medium capitalize mb-2">{sectionName}</h5>
                      <div className="bg-muted/50 p-3 rounded text-sm leading-relaxed">
                        {content || 'No content available'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tables and Images Summary */}
              {(extractedData.tables.length > 0 || extractedData.images.length > 0) && (
                <div className="space-y-2 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900">Additional Data</h4>
                  <p className="text-sm text-blue-700">
                    {extractedData.tables.length > 0 && `${extractedData.tables.length} table(s) `}
                    {extractedData.images.length > 0 && `${extractedData.images.length} image(s) `}
                    found and included in the complete JSON download.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main Content Grid */}
        <div className="grid gap-6">
          {/* Upload Section */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Upload PDF Files
                </CardTitle>
                <CardDescription>
                  Select an academic PDF for LLM-based extraction
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
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
                          Upload PDF Files
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Click to select PDF files for LLM processing
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        Choose PDF Files
                      </Button>
                    </label>
                  </div>
                  
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
                          {isProcessing ? "Processing..." : "Start LLM Extraction"}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleFileUpload(null)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}