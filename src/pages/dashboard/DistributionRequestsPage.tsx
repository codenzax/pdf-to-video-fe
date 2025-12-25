import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/pages/Dashboard';
import { distributionService, DistributionRequest } from '@/services/distributionService';
import { thesisSessionService } from '@/services/thesisSessionService';
import { toast } from 'sonner';
import { Youtube, Twitter, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, RefreshCw, Play, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { snsService } from '@/services/snsService';

// Video Preview Component
function VideoPreview({ videoBase64, onToggle, isVisible }: { videoBase64: string | null; onToggle: () => void; isVisible: boolean }) {
  if (!videoBase64) return null;
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
    >
      <Play className="h-4 w-4 mr-2" />
      {isVisible ? 'Hide Video' : 'Preview Video'}
    </Button>
  );
}

// Video Player Component
function VideoPlayer({ videoBase64 }: { videoBase64: string | null }) {
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (videoBase64) {
      try {
        // Handle both data:video/mp4;base64,... and plain base64
        const base64Data = videoBase64.startsWith('data:') 
          ? videoBase64.split(',')[1] 
          : videoBase64;
        const blob = new Blob(
          [Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))],
          { type: 'video/mp4' }
        );
        const url = URL.createObjectURL(blob);
        setVideoBlobUrl(url);
      } catch (e) {
        console.error('Failed to create video blob URL:', e);
        toast.error('Failed to load video preview');
      }
    }
    return () => {
      if (videoBlobUrl) {
        URL.revokeObjectURL(videoBlobUrl);
      }
    };
  }, [videoBase64]);

  if (!videoBlobUrl) return <div className="text-sm text-muted-foreground">Loading video...</div>;
  
  return (
    <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
      <video
        src={videoBlobUrl}
        controls
        className="w-full h-full"
        playsInline
      />
    </div>
  );
}

// Approval Dialog Component - Gets thesis data from session
function ApprovalDialog({
  request,
  open,
  onOpenChange,
  onApprove,
  onSuccess,
}: {
  request: DistributionRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (data: {
    platforms: ('youtube' | 'x')[];
    title: string;
    description: string;
    tags?: string[];
    youtubeSettings?: { privacy: 'public' | 'private' | 'unlisted' };
  }) => Promise<void>;
  onSuccess?: () => void;
}) {
  const [title, setTitle] = useState(request.title);
  const [description, setDescription] = useState(request.description || '');
  const [tags, setTags] = useState(request.tags ? (Array.isArray(request.tags) ? request.tags.join(', ') : String(request.tags)) : '');
  const [selectedPlatforms, setSelectedPlatforms] = useState<('youtube' | 'x')[]>((request.platforms as any) || []);
  const [youtubePrivacy, setYoutubePrivacy] = useState<'public' | 'private' | 'unlisted'>('private');
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [xConnected, setXConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingConnections, setCheckingConnections] = useState(true);
  const [loadingThesis, setLoadingThesis] = useState(true);

  useEffect(() => {
    if (open) {
      setTitle(request.title);
      // For retry, use existing description if available; otherwise load from session
      if (request.status === 'failed' && request.description) {
        setDescription(request.description);
        setLoadingThesis(false);
      } else {
        // Load thesis description from session for approval or if no description exists
        loadThesisDescription();
      }
      checkConnections();
    }
  }, [open, request]);

  const loadThesisDescription = async () => {
    try {
      setLoadingThesis(true);
      const session = await thesisSessionService.getSession(request.thesisSessionId, false);
      if (session.extractedData) {
        const extracted = typeof session.extractedData === 'string' 
          ? JSON.parse(session.extractedData) 
          : session.extractedData;
        const thesisDesc = extracted.metadata?.abstract || extracted.sections?.abstract || extracted.sections?.description || '';
        setDescription(thesisDesc);
      }
    } catch (e) {
      console.error('Failed to load thesis description:', e);
    } finally {
      setLoadingThesis(false);
    }
  };

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

    try {
      setLoading(true);
      const tagsArray = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

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
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      toast.error(error.message || 'Failed to approve request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve & Configure Distribution</DialogTitle>
          <DialogDescription>
            Specify platform, title, description, and tags before approving this distribution request.
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
          </div>

          {/* Video Metadata */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title * (Thesis Name)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Thesis title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Thesis Abstract)</Label>
              {loadingThesis ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading thesis description...
                </div>
              ) : (
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Thesis abstract/description"
                  rows={4}
                />
              )}
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
                {request.status === 'failed' ? 'Retrying...' : 'Approving...'}
              </>
            ) : (
              request.status === 'failed' ? 'Retry & Upload' : 'Approve & Upload'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DistributionRequestsPage() {
  const location = useLocation();
  const [distributionRequests, setDistributionRequests] = useState<DistributionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVideoRequest, setSelectedVideoRequest] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [requestToApprove, setRequestToApprove] = useState<DistributionRequest | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const requestsData = await distributionService.listRequests();
      setDistributionRequests(requestsData);
    } catch (error: any) {
      console.error('Failed to load data:', error);
      if (!silent) {
        toast.error('Failed to load sessions and requests');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const refreshTrigger = (location.state as any)?.refresh;
    if (refreshTrigger) {
      loadData(false);
    } else {
      loadData(true);
    }
  }, [loadData, location.pathname, location.state]);

  const distributionRequestsRef = useRef(distributionRequests);
  distributionRequestsRef.current = distributionRequests;

  const startPollingIfNeeded = useCallback(() => {
    if (pollingIntervalRef.current) {
      return;
    }

    pollingIntervalRef.current = setInterval(() => {
      const hasActiveRequests = distributionRequestsRef.current.some(
        req => req.status === 'uploading' || req.status === 'approved'
      );

      if (hasActiveRequests) {
        loadData(true);
      } else {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    }, 5000);
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Removed unused functions - handleRequestDistribution and handleDistributionSuccess
  // These were for a different flow that is no longer used

  const handleApproveRequest = async (requestId: string) => {
    const request = distributionRequests.find(r => r.id === requestId);
    if (!request) {
      toast.error('Request not found');
      return;
    }
    
    setRequestToApprove(request);
    setApprovalDialogOpen(true);
  };

  const handleApprovalDialogSubmit = async (approvalData: {
    platforms: ('youtube' | 'x')[];
    title: string;
    description: string;
    tags?: string[];
    youtubeSettings?: { privacy: 'public' | 'private' | 'unlisted' };
  }) => {
    if (!requestToApprove) return;
    
    try {
      setApprovingId(requestToApprove.id);
      
      await distributionService.approveRequest(requestToApprove.id, {
        platforms: approvalData.platforms,
        title: approvalData.title,
        description: approvalData.description,
        tags: approvalData.tags,
        youtubeSettings: approvalData.youtubeSettings,
      });
      
      toast.success('Request approved! Upload will begin shortly.');
      setApprovalDialogOpen(false);
      setRequestToApprove(null);
      await loadData();
      startPollingIfNeeded();
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      toast.error('Failed to approve request: ' + (error.message || 'Unknown error'));
    } finally {
      setApprovingId(null);
    }
  };

  const handleRetryRequest = async (requestId: string) => {
    const request = distributionRequests.find(r => r.id === requestId);
    if (!request) {
      toast.error('Request not found');
      return;
    }
    
    setRequestToApprove(request);
    setApprovalDialogOpen(true);
  };

  const handleRetryDialogSubmit = async (approvalData: {
    platforms: ('youtube' | 'x')[];
    title: string;
    description: string;
    tags?: string[];
    youtubeSettings?: { privacy: 'public' | 'private' | 'unlisted' };
  }) => {
    if (!requestToApprove) return;
    
    try {
      setRetryingId(requestToApprove.id);
      
      await distributionService.retryRequest(requestToApprove.id, {
        platforms: approvalData.platforms,
        title: approvalData.title,
        description: approvalData.description,
        tags: approvalData.tags,
        youtubeSettings: approvalData.youtubeSettings,
      });
      
      toast.success('Retry initiated! Upload will begin shortly.');
      setApprovalDialogOpen(false);
      setRequestToApprove(null);
      await loadData();
      startPollingIfNeeded();
    } catch (error: any) {
      console.error('Failed to retry request:', error);
      toast.error('Failed to retry request: ' + (error.message || 'Unknown error'));
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
      case 'uploading':
        return <Badge variant="default" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading</Badge>;
      case 'completed':
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };


  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Distribution Requests</h1>
            <p className="text-muted-foreground">
              Request distribution of your completed videos to YouTube and X (Twitter)
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {distributionRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Distribution Requests</CardTitle>
              <CardDescription>Track the status of your distribution requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {distributionRequests.map((request) => {
                  // Extract video base64 from videoUrl if it's a data URL
                  let videoBase64: string | null = null;
                  if (request.videoUrl) {
                    if (request.videoUrl.startsWith('data:video')) {
                      videoBase64 = request.videoUrl;
                    } else if (request.videoUrl.includes('base64,')) {
                      // Handle base64 data URL
                      videoBase64 = request.videoUrl;
                    }
                  }

                  return (
                    <div key={request.id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg">{request.title}</h3>
                          {getStatusBadge(request.status)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Title */}
                      <div>
                        <div className="text-sm font-semibold mb-1">Title:</div>
                        <div className="text-sm text-muted-foreground">{request.title}</div>
                      </div>

                      {/* Description */}
                      {request.description && (
                        <div>
                          <div className="text-sm font-semibold mb-1">Description:</div>
                          <div className="text-sm text-muted-foreground">{request.description}</div>
                        </div>
                      )}

                      {/* Platform */}
                      <div>
                        <div className="text-sm font-semibold mb-2">Platform:</div>
                        <div className="flex gap-2">
                          {request.platforms.includes('youtube') && (
                            <Badge variant="outline" className="gap-1">
                              <Youtube className="h-3 w-3 text-red-600" />
                              YouTube
                            </Badge>
                          )}
                          {request.platforms.includes('x') && (
                            <Badge variant="outline" className="gap-1">
                              <Twitter className="h-3 w-3 text-blue-400" />
                              X
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* View Video */}
                      {(videoBase64 || (request.videoUrl && request.videoUrl.startsWith('data:video'))) && (
                        <div>
                          <div className="text-sm font-semibold mb-2">View Video:</div>
                          <VideoPreview 
                            videoBase64={videoBase64 || (request.videoUrl?.startsWith('data:video') ? request.videoUrl : null)}
                            onToggle={() => {
                              // Toggle video player visibility
                              setSelectedVideoRequest(request.id === selectedVideoRequest ? null : request.id);
                            }}
                            isVisible={selectedVideoRequest === request.id}
                          />
                          {selectedVideoRequest === request.id && (videoBase64 || (request.videoUrl?.startsWith('data:video') ? request.videoUrl : null)) && (
                            <div className="mt-2">
                              <VideoPlayer videoBase64={videoBase64 || (request.videoUrl?.startsWith('data:video') ? request.videoUrl : null)} />
                            </div>
                          )}
                        </div>
                      )}
                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2 border-t">
                        {request.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleApproveRequest(request.id)}
                            disabled={approvingId === request.id}
                          >
                            {approvingId === request.id ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Approving...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="mr-2 h-3 w-3" />
                                Approve & Upload
                              </>
                            )}
                          </Button>
                        )}
                        {request.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetryRequest(request.id)}
                            disabled={retryingId === request.id}
                          >
                            {retryingId === request.id ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Retrying...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="mr-2 h-3 w-3" />
                                Retry
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Status Messages */}
                      {request.status === 'rejected' && request.rejectionReason && (
                        <Alert className="mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            Rejection reason: {request.rejectionReason}
                          </AlertDescription>
                        </Alert>
                      )}
                      {request.status === 'completed' && request.uploadResults && (
                        <div className="mt-2 space-y-1 text-xs">
                          {request.uploadResults.youtube?.status === 'completed' && request.uploadResults.youtube?.videoUrl && (
                            <div className="text-green-600">
                              ✅ YouTube: <a href={request.uploadResults.youtube.videoUrl} target="_blank" rel="noopener noreferrer" className="underline">View Video</a>
                            </div>
                          )}
                          {request.uploadResults.youtube?.status === 'failed' && (
                            <div className="text-red-600">
                              ❌ YouTube: {request.uploadResults.youtube.error || 'Upload failed'}
                            </div>
                          )}
                          {request.uploadResults.x?.status === 'completed' && request.uploadResults.x?.tweetUrl && (
                            <div className="text-green-600">
                              ✅ X: <a href={request.uploadResults.x.tweetUrl} target="_blank" rel="noopener noreferrer" className="underline">View Tweet</a>
                            </div>
                          )}
                          {request.uploadResults.x?.status === 'failed' && (
                            <div className="text-red-600">
                              ❌ X: {request.uploadResults.x.error || 'Upload failed'}
                            </div>
                          )}
                        </div>
                      )}
                      {request.status === 'uploading' && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Uploading to platforms...</span>
                        </div>
                      )}
                      {request.status === 'failed' && request.errorMessage && (
                        <Alert className="mt-2" variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            {request.errorMessage}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}


        {requestToApprove && (
          <ApprovalDialog
            request={requestToApprove}
            open={approvalDialogOpen}
            onOpenChange={(open) => {
              setApprovalDialogOpen(open);
              if (!open) {
                setRequestToApprove(null);
              }
            }}
            onApprove={requestToApprove.status === 'failed' ? handleRetryDialogSubmit : handleApprovalDialogSubmit}
            onSuccess={() => {
              setRequestToApprove(null);
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
