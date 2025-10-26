import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface JsonData {
  metadata?: {
    title?: string
    authors?: string[] | Array<{ firstName: string; lastName: string; email?: string; affiliation?: string }>
    abstract?: string
    keywords?: string[]
  }
  sections?: Array<{
    title: string
    content: string
    level: number
  }> | Record<string, any> // Allow both array and object formats
  tables?: Array<{
    caption: string
    data: any
  }>
  figures?: Array<{
    caption: string
    description: string
  }>
  images?: Array<{
    caption: string
    description: string
  }>
}

interface JsonUploadProps {
  onJsonLoaded: (data: JsonData) => void
  onGenerateScript: () => void
  isLoading?: boolean
}

export function JsonUpload({ onJsonLoaded, onGenerateScript, isLoading = false }: JsonUploadProps) {
  const [jsonData, setJsonData] = useState<JsonData | null>(null)
  const [isUploaded, setIsUploaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null) // Clear any previous errors

    if (!file.name.endsWith('.json')) {
      setError('Please upload a JSON file')
      toast.error('Please upload a JSON file')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        console.log('File content:', content) // Debug log
        const parsedData = JSON.parse(content)
        console.log('Parsed data:', parsedData) // Debug log
        setJsonData(parsedData)
        setIsUploaded(true)
        onJsonLoaded(parsedData)
        toast.success('JSON file uploaded successfully')
      } catch (error) {
        console.error('JSON parsing error:', error)
        setError('Invalid JSON file format')
        toast.error('Invalid JSON file')
      }
    }
    reader.onerror = () => {
      setError('Error reading file')
      toast.error('Error reading file')
    }
    reader.readAsText(file)
  }, [onJsonLoaded])

  const renderMetadata = () => {
    if (!jsonData?.metadata) return null

    const { title, authors, abstract, keywords } = jsonData.metadata

    return (
      <div className="space-y-3 p-3 border rounded-md bg-muted/20">
        <h4 className="font-medium text-sm">Metadata</h4>
        <div className="space-y-2 text-sm">
          {title && (
            <div>
              <span className="font-medium text-muted-foreground">Title:</span>
              <p className="mt-1">{title}</p>
            </div>
          )}
          {authors && authors.length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">Authors:</span>
              <p className="mt-1">
                {authors.map((author) => {
                  // Handle both string and object formats
                  if (typeof author === 'string') {
                    return author;
                  }
                  // If it's an object with firstName and lastName
                  return `${author.firstName} ${author.lastName}`;
                }).join(', ')}
              </p>
            </div>
          )}
          {abstract && (
            <div>
              <span className="font-medium text-muted-foreground">Abstract:</span>
              <p className="mt-1 text-muted-foreground line-clamp-3">{abstract}</p>
            </div>
          )}
          {keywords && keywords.length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">Keywords:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {keywords.map((keyword, index) => (
                  <Badge key={index} variant="outline" className="text-xs">{keyword}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderSections = () => {
    if (!jsonData?.sections) return null

    // Handle both array and object formats
    let sectionsArray: any[] = []
    if (Array.isArray(jsonData.sections)) {
      sectionsArray = jsonData.sections
    } else if (typeof jsonData.sections === 'object') {
      // Convert object to array of key-value pairs
      sectionsArray = Object.entries(jsonData.sections).map(([key, value]) => ({
        title: key,
        content: typeof value === 'string' ? value : JSON.stringify(value),
        level: 1
      }))
    }

    if (sectionsArray.length === 0) return null

    return (
      <div className="space-y-2 p-3 border rounded-md bg-muted/20">
        <h4 className="font-medium text-sm">Sections ({sectionsArray.length})</h4>
        <div className="space-y-2">
          {sectionsArray.map((section, index) => (
            <div key={index} className="p-2 border rounded bg-background">
              <h5 className="font-medium text-sm">{section.title}</h5>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {typeof section.content === 'string' 
                  ? section.content.substring(0, 150) + '...'
                  : JSON.stringify(section.content).substring(0, 150) + '...'
                }
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderTables = () => {
    if (!jsonData?.tables || jsonData.tables.length === 0) return null

    return (
      <div className="p-3 border rounded-md bg-muted/20">
        <h4 className="font-medium text-sm">Tables ({jsonData.tables.length})</h4>
        <p className="text-xs text-muted-foreground mt-1">
          {jsonData.tables.length} tables available for script generation
        </p>
      </div>
    )
  }

  const renderFigures = () => {
    if (!jsonData?.figures || jsonData.figures.length === 0) return null

    return (
      <div className="p-3 border rounded-md bg-muted/20">
        <h4 className="font-medium text-sm">Figures ({jsonData.figures.length})</h4>
        <p className="text-xs text-muted-foreground mt-1">
          {jsonData.figures.length} figures available for script generation
        </p>
      </div>
    )
  }

  const renderImages = () => {
    if (!jsonData?.images || jsonData.images.length === 0) return null

    return (
      <div className="p-3 border rounded-md bg-muted/20">
        <h4 className="font-medium text-sm">Images ({jsonData.images.length})</h4>
        <p className="text-xs text-muted-foreground mt-1">
          {jsonData.images.length} images available for script generation
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="rounded-full bg-muted p-3">
            <Upload className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-medium">Upload JSON File</h3>
            <p className="text-sm text-muted-foreground">
              Drag and drop your JSON file here, or click to browse
            </p>
          </div>
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="hidden"
            id="json-upload"
          />
          <Button asChild>
            <label htmlFor="json-upload" className="cursor-pointer">
              <FileText className="h-4 w-4 mr-2" />
              Choose JSON File
            </label>
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* JSON Preview */}
      {isUploaded && jsonData && !error && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              JSON File Preview
            </CardTitle>
            <CardDescription>
              Review the extracted content before generating the script
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderMetadata()}
            {renderSections()}
            {renderTables()}
            {renderFigures()}
            {renderImages()}
            
            <div className="pt-4 border-t">
              <Button 
                onClick={onGenerateScript} 
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Generating Script...' : 'Generate Script'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}