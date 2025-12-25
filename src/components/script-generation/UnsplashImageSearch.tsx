import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, Sparkles, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { unsplashService, UnsplashImageData } from '@/services/unsplashService'
import { Card, CardContent } from '@/components/ui/card'

interface UnsplashImageSearchProps {
  sentence: string
  context?: {
    fullScript?: string
    paperTitle?: string
    researchDomain?: string
  }
  onSelectImage: (imageData: UnsplashImageData) => void
  onCancel?: () => void
}

export function UnsplashImageSearch({
  sentence,
  context,
  onSelectImage,
  onCancel,
}: UnsplashImageSearchProps) {
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([])
  const [isExtractingKeywords, setIsExtractingKeywords] = useState(false)
  const [images, setImages] = useState<UnsplashImageData[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [totalResults, setTotalResults] = useState<number>(0)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // Extract keywords on mount
  useEffect(() => {
    extractKeywords()
  }, [sentence])

  const extractKeywords = async () => {
    setIsExtractingKeywords(true)
    try {
      const keywords = await unsplashService.extractKeywords(sentence, context)
      setSuggestedKeywords(keywords)
      // Auto-fill search query with first keyword or join all keywords
      if (keywords.length > 0) {
        const query = keywords.slice(0, 3).join(' ') // Use first 3 keywords
        setSearchQuery(query)
        // Auto-search with suggested keywords
        handleSearch(query)
      }
    } catch (error: any) {
      console.error('Failed to extract keywords:', error)
      toast.error('Failed to extract keywords. You can search manually.')
    } finally {
      setIsExtractingKeywords(false)
    }
  }

  const handleSearch = async (query?: string) => {
    const searchTerm = query || searchQuery.trim()
    if (!searchTerm) {
      toast.error('Please enter a search query')
      return
    }

    setIsSearching(true)
    setPage(1)
    try {
      const results = await unsplashService.searchImages(searchTerm, 1, 12, 'landscape')
      setImages(results.results)
      setTotalResults(results.total)
      if (results.results.length === 0) {
        toast.info('No images found. Try different keywords.')
      }
    } catch (error: any) {
      console.error('Unsplash search error:', error)
      toast.error(error.message || 'Failed to search Unsplash')
    } finally {
      setIsSearching(false)
    }
  }

  const handleLoadMore = async () => {
    if (!searchQuery.trim() || isSearching) return

    setIsSearching(true)
    try {
      const results = await unsplashService.searchImages(searchQuery.trim(), page + 1, 12, 'landscape')
      setImages((prev) => [...prev, ...results.results])
      setPage((prev) => prev + 1)
    } catch (error: any) {
      console.error('Failed to load more images:', error)
      toast.error('Failed to load more images')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelect = (image: UnsplashImageData) => {
    setSelectedImageId(image.id)
    onSelectImage(image)
    toast.success('Image selected! Generating video...')
  }

  const handleKeywordClick = (keyword: string) => {
    setSearchQuery(keyword)
    handleSearch(keyword)
  }

  return (
    <div className="space-y-4">
      {/* Search Section */}
      <div className="space-y-3">
        <div>
          <Label htmlFor="unsplash-search">Search for Images</Label>
          <div className="flex gap-2 mt-1">
            <Input
              id="unsplash-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch()
                }
              }}
              placeholder="Enter keywords (e.g., machine learning, data science)"
              className="flex-1"
            />
            <Button
              onClick={() => handleSearch()}
              disabled={isSearching || !searchQuery.trim()}
              size="sm"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Suggested Keywords */}
        {suggestedKeywords.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3 w-3 text-primary" />
              <Label className="text-xs text-muted-foreground">Suggested Keywords (Click to search)</Label>
              {isExtractingKeywords && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedKeywords.map((keyword, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => handleKeywordClick(keyword)}
                >
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Results Count */}
        {totalResults > 0 && (
          <p className="text-xs text-muted-foreground">
            Found {totalResults.toLocaleString()} images
          </p>
        )}
      </div>

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto p-1">
            {images.map((image) => (
              <Card
                key={image.id}
                className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary ${
                  selectedImageId === image.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => handleSelect(image)}
              >
                <CardContent className="p-0">
                  <div className="relative aspect-video overflow-hidden rounded-t-lg">
                    <img
                      src={image.url}
                      alt={image.description || 'Unsplash image'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {selectedImageId === image.id && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Badge className="bg-primary text-primary-foreground">Selected</Badge>
                      </div>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {image.description || 'No description'}
                    </p>
                    <a
                      href={image.photographerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      by {image.photographer}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Load More Button */}
          {totalResults > images.length && (
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isSearching}
              className="w-full"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                `Load More (${totalResults - images.length} remaining)`
              )}
            </Button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isSearching && images.length === 0 && searchQuery && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No images found. Try different keywords.</p>
        </div>
      )}

      {/* Cancel Button */}
      {onCancel && (
        <Button variant="outline" onClick={onCancel} className="w-full">
          Cancel
        </Button>
      )}
    </div>
  )
}
