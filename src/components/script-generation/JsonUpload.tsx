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
    category?: 'methodology' | 'results'
  }>
  images?: Array<{
    caption: string
    description: string
    category?: 'methodology' | 'results'
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

    const methodologyCount = jsonData.figures.filter(f => f.category === 'methodology').length
    const resultsCount = jsonData.figures.filter(f => f.category === 'results').length

    return (
      <div className="p-3 border rounded-md bg-muted/20">
        <h4 className="font-medium text-sm mb-2">Figures ({jsonData.figures.length})</h4>
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {methodologyCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                Methodology: {methodologyCount}
              </Badge>
            )}
            {resultsCount > 0 && (
              <Badge variant="outline" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                Results: {resultsCount}
              </Badge>
            )}
          </div>
          <div className="space-y-2 mt-2">
            {jsonData.figures.map((figure, index) => (
              <div key={index} className="p-2 border rounded bg-background">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{figure.caption || `Figure ${index + 1}`}</span>
                      {figure.category && (
                        <Badge 
                          variant="outline" 
                          className={figure.category === 'methodology' 
                            ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                            : 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                          }
                        >
                          {figure.category === 'methodology' ? '📊 Methodology' : '📈 Results'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {figure.description || 'No description available'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderImages = () => {
    if (!jsonData?.images || jsonData.images.length === 0) return null

    const methodologyCount = jsonData.images.filter(img => img.category === 'methodology').length
    const resultsCount = jsonData.images.filter(img => img.category === 'results').length

    return (
      <div className="p-3 border rounded-md bg-muted/20">
        <h4 className="font-medium text-sm mb-2">Images ({jsonData.images.length})</h4>
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {methodologyCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                Methodology: {methodologyCount}
              </Badge>
            )}
            {resultsCount > 0 && (
              <Badge variant="outline" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                Results: {resultsCount}
              </Badge>
            )}
          </div>
          <div className="space-y-2 mt-2">
            {jsonData.images.map((image, index) => (
              <div key={index} className="p-2 border rounded bg-background">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{image.caption || `Image ${index + 1}`}</span>
                      {image.category && (
                        <Badge 
                          variant="outline" 
                          className={image.category === 'methodology' 
                            ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                            : 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                          }
                        >
                          {image.category === 'methodology' ? '📊 Methodology' : '📈 Results'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {image.description || 'No description available'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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