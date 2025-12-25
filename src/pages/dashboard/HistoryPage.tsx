import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/pages/Dashboard';
import { thesisSessionService, ThesisSession } from '@/services/thesisSessionService';
import { toast } from 'sonner';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  Loader2, 
  Trash2,
  RefreshCw,
  ArrowRight,
  History,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Simple date formatter
const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 2592000) {
    const weeks = Math.floor(diffInSeconds / 604800);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  }
  const months = Math.floor(diffInSeconds / 2592000);
  return `${months} month${months !== 1 ? 's' : ''} ago`;
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ThesisSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await thesisSessionService.listSessions();
      setSessions(data);
    } catch (error: any) {
      console.error('Failed to load sessions:', error);
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleResumeSession = async (session: ThesisSession) => {
    // Navigate to PDF to Video page with session ID
    navigate(`/pdf-to-video?sessionId=${session.id}`);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingId(sessionId);
      await thesisSessionService.deleteSession(sessionId);
      toast.success('Session deleted successfully');
      await loadSessions();
    } catch (error: any) {
      console.error('Failed to delete session:', error);
      toast.error('Failed to delete session: ' + (error.message || 'Unknown error'));
    } finally {
      setDeletingId(null);
    }
  };

  const getStageBadge = (stage: string | null | undefined) => {
    if (!stage) return <Badge variant="secondary">No Stage</Badge>;
    
    const stageMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      'pdf_extraction': { label: 'PDF Extraction', variant: 'secondary' },
      'script_generation': { label: 'Script Generation', variant: 'outline' },
      'script_selection': { label: 'Script Selection', variant: 'outline' },
      'video_generation': { label: 'Video Generation', variant: 'outline' },
      'video_completed': { label: 'Video Completed', variant: 'default' },
    };
    
    const stageInfo = stageMap[stage] || { label: stage, variant: 'secondary' as const };
    return <Badge variant={stageInfo.variant}>{stageInfo.label}</Badge>;
  };

  const hasData = (session: ThesisSession): { hasExtracted: boolean; hasScript: boolean; hasVideo: boolean } => {
    // For optimized list view, we don't have full data - show basic status based on stage
    // Full data check would require loading full session (slow), so we infer from currentStage
    const stage = session.currentStage;
    return {
      hasExtracted: true, // If session exists, extraction was done
      hasScript: stage === 'script_selection' || stage === 'script_generation' || stage === 'video_generation',
      hasVideo: stage === 'video_generation' || stage === 'video_completed',
    };
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
            <h1 className="text-3xl font-bold">History</h1>
            <p className="text-muted-foreground">
              View and manage all your thesis sessions
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSessions}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Thesis Sessions</CardTitle>
            <CardDescription>
              All your PDF processing sessions. Click on a session to resume work on it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No sessions found.</p>
                <p className="text-sm mt-2">Start by uploading a PDF in the PDF to Video page.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => {
                  const dataStatus = hasData(session);
                  
                  return (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <h3 className="font-semibold text-lg">{session.title || 'Untitled Session'}</h3>
                          {getStageBadge(session.currentStage)}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(session.updatedAt)}
                          </span>
                          <span>Created: {new Date(session.createdAt).toLocaleDateString()}</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {dataStatus.hasExtracted && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              PDF Extracted
                            </Badge>
                          )}
                          {dataStatus.hasScript && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Script Generated
                            </Badge>
                          )}
                          {dataStatus.hasVideo && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Video Completed
                            </Badge>
                          )}
                          {!dataStatus.hasExtracted && !dataStatus.hasScript && !dataStatus.hasVideo && (
                            <Badge variant="outline" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              No Data
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="default"
                          onClick={() => handleResumeSession(session)}
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Resume
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDeleteSession(session.id)}
                          disabled={deletingId === session.id}
                        >
                          {deletingId === session.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
