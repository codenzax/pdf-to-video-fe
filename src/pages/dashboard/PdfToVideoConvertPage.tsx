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
import { PdfDropzone } from "@/components/PdfDropzone";
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
} from "lucide-react";
import { PdfProcessingService } from "@/services/PdfProcessingService";
import { toast } from "sonner";

interface ProcessingStep {
  id: string;
  title: string;
  status: "pending" | "processing" | "completed" | "error";
  description: string;
}

export default function PdfToVideoConvertPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedText, setParsedText] = useState<string>("");
  const [totalPages, setTotalPages] = useState<number>(0);

  const steps: ProcessingStep[] = [
    {
      id: "upload",
      title: "PDF Upload",
      status: uploadedFile ? "completed" : "pending",
      description: "Upload and validate PDF file",
    },
    {
      id: "parse",
      title: "PDF Parsing",
      status: "pending",
      description: "Extract text content from PDF pages",
    },
  ];

  const handleFileUpload = (file: File | null) => {
    setUploadedFile(file);
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
    setParsedText("");
    setTotalPages(0);

    try {
      // Step 1: PDF Parsing
      setProcessingSteps((prev) =>
        prev.map((step) =>
          step.id === "parse"
            ? { ...step, status: "processing" as const }
            : step
        )
      );

      toast.info("Parsing PDF files...");
      
      // Parse PDF using the service
      const result = await PdfProcessingService.processPdf(uploadedFile);
      
      setParsedText(result.text);
      setTotalPages(result.pages);

      setProcessingSteps((prev) =>
        prev.map((step) =>
          step.id === "parse" ? { ...step, status: "completed" as const } : step
        )
      );

      toast.success(`Successfully parsed PDF with ${result.pages} pages`);

    } catch (error) {
      console.error("Processing error:", error);
      toast.error(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">PDF Parser</h1>
          <p className="text-muted-foreground">
            Upload PDF documents and extract text content from them.
          </p>
        </div>

        {/* Processing Steps */}
        {processingSteps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Processing Steps</CardTitle>
                <CardDescription>
                  Track the progress of your PDF parsing
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

        {/* Parsed Text Content */}
        {parsedText && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Parsed PDF Content
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(parsedText)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Text
                </Button>
              </CardTitle>
              <CardDescription>
                Extracted text from PDF file • {totalPages} pages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/50 rounded-lg max-h-96 overflow-y-auto">
                <pre className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
                  {parsedText}
                </pre>
              </div>
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
                  Select a PDF file to parse and extract text
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PdfDropzone 
                  onFileUploaded={handleFileUpload} 
                  onParsePdf={startProcessing}
                  isProcessing={isProcessing}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Conversions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Conversions</CardTitle>
            <CardDescription>
              Your recently converted PDF to video files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">
                No recent conversions
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your converted videos will appear here
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
