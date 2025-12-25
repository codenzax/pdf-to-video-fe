import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  Loader2, 
  Trash2,
  RefreshCw,
  ArrowRight,
  History
} from 'lucide-react';
import { toast } from 'sonner';
import { thesisSessionService, ThesisSession } from '@/services/thesisSessionService';

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

interface ThesisSessionListProps {
  onSelectSession: (session: ThesisSession) => void;
  onNewSession?: () => void;
  currentSessionId?: string | null;
  refreshTrigger?: number; // When this changes, refresh the list
}

export function ThesisSessionList({ 
  onSelectSession, 
  onNewSession,
  currentSessionId,
  refreshTrigger
}: ThesisSessionListProps) {
  const [sessions, setSessions] = useState<ThesisSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Prevent multiple simultaneous loads
  const lastLoadTimeRef = useRef<number>(0);
  const loadingRef = useRef<boolean>(false);

  const loadSessions = async (retryCount = 0) => {
    // Prevent multiple simultaneous loads
    if (loadingRef.current && retryCount === 0) {
      console.log('⏸️ Load already in progress, skipping...');
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      console.log('📋 Loading thesis sessions...');
      const data = await thesisSessionService.listSessions();
      console.log('✅ Loaded sessions:', data.length, data);
      setSessions(data);
      lastLoadTimeRef.current = Date.now();
    } catch (error: any) {
      console.error('❌ Failed to load sessions:', error);
      
      // Handle rate limiting with exponential backoff retry
      if (error.response?.status === 429 && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.warn(`Rate limited, retrying in ${delay}ms... (attempt ${retryCount + 1}/3)`);
        setTimeout(() => {
          loadSessions(retryCount + 1);
        }, delay);
        return;
      }
      
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      
      // Don't show toast on rate limit errors - user can retry manually
      if (error.response?.status === 429) {
        console.warn('Rate limit exceeded. Please wait a moment and try refreshing.');
      } else if (error.response?.status !== 401) {
        toast.error(error.message || 'Failed to load thesis sessions');
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    // Only load if not already loading and at least 1 second since last load
    const now = Date.now();
    if (!loadingRef.current && (now - lastLoadTimeRef.current > 1000)) {
      lastLoadTimeRef.current = now;
      loadSessions(0);
    }
  }, []);

  // Refresh when refreshTrigger changes (debounced)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      // Debounce refresh trigger
      const timeoutId = setTimeout(() => {
        const now = Date.now();
        if (!loadingRef.current && (now - lastLoadTimeRef.current > 1000)) {
          lastLoadTimeRef.current = now;
          console.log('🔄 Refreshing thesis session list, trigger:', refreshTrigger);
          loadSessions(0);
        }
      }, 500); // Wait 500ms after trigger

      return () => clearTimeout(timeoutId);
    }
  }, [refreshTrigger]);

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this thesis session? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingId(sessionId);
      await thesisSessionService.deleteSession(sessionId);
      toast.success('Session deleted successfully');
      await loadSessions();
    } catch (error: any) {
      console.error('Failed to delete session:', error);
      toast.error(error.message || 'Failed to delete session');
    } finally {
      setDeletingId(null);
    }
  };

  const getStageBadge = (stage: string | null) => {
    if (!stage) return null;
    
    const stageMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      'pdf_extraction': { label: 'PDF Extracted', variant: 'default' },
      'script_generation': { label: 'Script Generated', variant: 'secondary' },
      'script_selection': { label: 'Script Selected', variant: 'secondary' },
      'video_generation': { label: 'Video Generated', variant: 'outline' },
      'completed': { label: 'Completed', variant: 'default' },
    };

    const stageInfo = stageMap[stage] || { label: stage, variant: 'outline' as const };
    return <Badge variant={stageInfo.variant}>{stageInfo.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'active':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Thesis History
          </CardTitle>
          <CardDescription>Your previous thesis work</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading sessions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Thesis History
            </CardTitle>
            <CardDescription>Continue from where you left off</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSessions()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {onNewSession && (
              <Button
                variant="default"
                size="sm"
                onClick={onNewSession}
              >
                New Thesis
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">No thesis sessions yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Upload a PDF and extract it to start a new thesis project
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSessions()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh List
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session)}
                className={`
                  p-4 rounded-lg border cursor-pointer transition-all
                  hover:bg-accent hover:border-primary
                  ${currentSessionId === session.id ? 'bg-accent border-primary' : 'bg-card'}
                `}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(session.status)}
                      <h3 className="font-semibold text-sm truncate">{session.title}</h3>
                    </div>
                    
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      {getStageBadge(session.currentStage)}
                      {session.checkpointCount !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {session.checkpointCount} checkpoint{session.checkpointCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(session.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDelete(session.id, e)}
                      disabled={deletingId === session.id}
                      className="h-8 w-8 p-0"
                    >
                      {deletingId === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
