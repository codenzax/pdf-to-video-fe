import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'


interface PdfDropzoneProps {
  onFileUploaded?: (file: File | null) => void
  onParsePdf?: () => void
  isProcessing?: boolean
}

export function PdfDropzone({ onFileUploaded, onParsePdf, isProcessing }: PdfDropzoneProps) {
  const [file, setFile] = useState<File | null>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Only take the first file
    const selectedFile = acceptedFiles[0]
    if (selectedFile) {
      setFile(selectedFile)
      
      // Notify parent component about uploaded file
      if (onFileUploaded) {
        onFileUploaded(selectedFile)
      }
    }
  }, [onFileUploaded])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: false
  })

  const removeFile = () => {
    setFile(null)
    
    // Notify parent component about removed file
    if (onFileUploaded) {
      onFileUploaded(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <Card>
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
              }
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center space-y-4">
              <div className="p-3 rounded-full bg-muted">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">
                  {isDragActive ? 'Drop PDFs here' : 'Upload PDF files'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Drag and drop PDF files here, or click to select files
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF format only • Single file
                </p>
              </div>
              <Button variant="outline" size="sm">
                Choose Files
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Display */}
      {file && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Uploaded File</h3>
              </div>
              <div className="flex items-center space-x-3 p-3 border rounded-lg bg-muted/30">
                <div className="p-2 rounded bg-red-100 dark:bg-red-900/20">
                  <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {file.name || 
                     ((file as any).path ? (file as any).path.split('/').pop() : null) || 
                     'Unknown file'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex space-x-2 pt-4">
                <Button 
                  className="flex-1" 
                  onClick={onParsePdf}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Parse PDF"}
                </Button>
                <Button variant="outline" onClick={removeFile}>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
