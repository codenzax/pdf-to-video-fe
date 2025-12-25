import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { distributionService } from '@/services/distributionService';
import { snsService } from '@/services/snsService';
import { Youtube, Twitter, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DistributionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
  videoBase64?: string;
  thesisSessionId: string;
  defaultTitle?: string;
  defaultDescription?: string;
  onSuccess?: () => void;
  // Approval mode - when true, calls onApprove instead of createRequest
  approvalMode?: boolean;
  onApprove?: (data: {
    platforms: ('youtube' | 'x')[];
    title: string;
    description: string;
    tags?: string[];
    youtubeSettings?: { privacy: 'public' | 'private' | 'unlisted' };
  }) => Promise<void>;
}

export function DistributionRequestDialog({
  open,
  onOpenChange,
  videoUrl,
  videoBase64,
  thesisSessionId,
  defaultTitle = '',
  defaultDescription = '',
  onSuccess,
  approvalMode = false,
  onApprove,
}: DistributionRequestDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [tags, setTags] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<('youtube' | 'x')[]>([]);
  const [youtubePrivacy, setYoutubePrivacy] = useState<'public' | 'private' | 'unlisted'>('private');
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [xConnected, setXConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingConnections, setCheckingConnections] = useState(true);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setDescription(defaultDescription);
      checkConnections();
    }
  }, [open, defaultTitle, defaultDescription]);

  const checkConnections = async () => {
    try {
      setCheckingConnections(true);
      const [youtube, x] = await Promise.all([
        snsService.getConnectionStatus('youtube').catch(() => ({ connected: false })),
        snsService.getConnectionStatus('x').catch(() => ({ connected: false })),
      ]);
      setYoutubeConnected(youtube.connected);
      setXConnected(x.connected);
    } catch (error) {
      console.error('Failed to check connections:', error);
    } finally {
      setCheckingConnections(false);
    }
  };

  const handlePlatformToggle = (platform: 'youtube' | 'x') => {
    if (selectedPlatforms.includes(platform)) {
      setSelectedPlatforms(selectedPlatforms.filter(p => p !== platform));
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (selectedPlatforms.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }

    // Check connections
    if (selectedPlatforms.includes('youtube') && !youtubeConnected) {
      toast.error('Please connect your YouTube account first in Settings');
      return;
    }

    if (selectedPlatforms.includes('x') && !xConnected) {
      toast.error('Please connect your X account first in Settings');
      return;
    }

    try {
      setLoading(true);

      // Handle video URL or base64
      // Priority: videoBase64 (most reliable) > data URL > regular URL > blob URL (needs conversion)
      let finalVideoUrl = videoUrl;

      // If we have videoBase64, always prefer it (convert to data URL)
      // The backend upload services can handle data URLs with base64
      if (videoBase64) {
        // Ensure videoBase64 is clean (remove data: prefix if present)
        const cleanBase64 = videoBase64.startsWith('data:') 
          ? videoBase64.split(',')[1] 
          : videoBase64;
        finalVideoUrl = `data:video/mp4;base64,${cleanBase64}`;
      } else if (videoUrl) {
        // Use videoUrl if it's a data URL or regular URL
        if (videoUrl.startsWith('data:')) {
          finalVideoUrl = videoUrl;
        } else if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
          finalVideoUrl = videoUrl;
        } else if (videoUrl.startsWith('blob:')) {
          // Blob URLs won't work for backend - need base64
          toast.error('Please export the video first. The exported video will be saved with base64 data.');
          return;
        } else if (videoUrl === 'VIDEO_EXISTS_BUT_NO_URL') {
          // This means video exists but we don't have URL/base64 here
          toast.error('Video data is required. Please ensure the video was exported properly.');
          return;
        }
      }

      // Final check - must have a valid video URL
      if (!finalVideoUrl || (!finalVideoUrl.startsWith('data:') && !finalVideoUrl.startsWith('http'))) {
        toast.error('Video data is required for distribution. Please export the video first.');
        return;
      }

      const tagsArray = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      if (approvalMode && onApprove) {
        // Approval mode - call onApprove callback
        await onApprove({
          platforms: selectedPlatforms,
          title: title.trim(),
          description: description.trim(),
          tags: tagsArray.length > 0 ? tagsArray : undefined,
          youtubeSettings: selectedPlatforms.includes('youtube') ? {
            privacy: youtubePrivacy,
          } : undefined,
        });
        onSuccess?.();
        onOpenChange(false);
      } else {
        // Normal mode - create new request
        await distributionService.createRequest({
          thesisSessionId,
          videoUrl: finalVideoUrl,
          title: title.trim(),
          description: description.trim() || undefined,
          tags: tagsArray.length > 0 ? tagsArray : undefined,
          platforms: selectedPlatforms,
          youtubeSettings: selectedPlatforms.includes('youtube') ? {
            privacy: youtubePrivacy,
          } : undefined,
        });

        toast.success('Distribution request submitted! Admin will review it shortly.');
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('Failed to create distribution request:', error);
      toast.error(error.message || 'Failed to submit distribution request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Video Distribution</DialogTitle>
          <DialogDescription>
            Submit your video for distribution to YouTube and/or X (Twitter). You can approve and upload after creating the request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Platform Selection */}
          <div className="space-y-3">
            <Label>Select Platforms</Label>
            <div className="grid gap-3 md:grid-cols-2">
              <div
                className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                  selectedPlatforms.includes('youtube')
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => handlePlatformToggle('youtube')}
              >
                <Checkbox
                  checked={selectedPlatforms.includes('youtube')}
                  onCheckedChange={() => handlePlatformToggle('youtube')}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Youtube className="h-5 w-5 text-red-600" />
                    <Label className="cursor-pointer font-medium">YouTube</Label>
                  </div>
                  {checkingConnections ? (
                    <p className="text-xs text-muted-foreground mt-1">Checking connection...</p>
                  ) : youtubeConnected ? (
                    <Badge variant="default" className="mt-1 text-xs">
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      Not Connected
                    </Badge>
                  )}
                </div>
              </div>

              <div
                className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                  selectedPlatforms.includes('x')
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => handlePlatformToggle('x')}
              >
                <Checkbox
                  checked={selectedPlatforms.includes('x')}
                  onCheckedChange={() => handlePlatformToggle('x')}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Twitter className="h-5 w-5 text-blue-400" />
                    <Label className="cursor-pointer font-medium">X (Twitter)</Label>
                  </div>
                  {checkingConnections ? (
                    <p className="text-xs text-muted-foreground mt-1">Checking connection...</p>
                  ) : xConnected ? (
                    <Badge variant="default" className="mt-1 text-xs">
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      Not Connected
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {(!youtubeConnected || !xConnected) && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {!youtubeConnected && selectedPlatforms.includes('youtube') && (
                    <span>Please connect your YouTube account in <a href="/settings/sns" className="underline">Settings</a> first.</span>
                  )}
                  {!xConnected && selectedPlatforms.includes('x') && (
                    <span>Please connect your X account in <a href="/settings/sns" className="underline">Settings</a> first.</span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Video Metadata */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Video title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Video description"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </div>

          {/* YouTube Settings */}
          {selectedPlatforms.includes('youtube') && (
            <div className="space-y-2">
              <Label>YouTube Privacy Setting</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={youtubePrivacy === 'public' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setYoutubePrivacy('public')}
                >
                  Public
                </Button>
                <Button
                  type="button"
                  variant={youtubePrivacy === 'unlisted' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setYoutubePrivacy('unlisted')}
                >
                  Unlisted
                </Button>
                <Button
                  type="button"
                  variant={youtubePrivacy === 'private' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setYoutubePrivacy('private')}
                >
                  Private
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || selectedPlatforms.length === 0}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              approvalMode ? 'Approve & Upload' : 'Submit Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
