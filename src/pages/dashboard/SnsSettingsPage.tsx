import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/pages/Dashboard';
import { snsService } from '@/services/snsService';
import { toast } from 'sonner';
import { Youtube, Twitter, CheckCircle2, XCircle, Loader2, Link2, Unlink } from 'lucide-react';

export default function SnsSettingsPage() {
  const [youtubeStatus, setYoutubeStatus] = useState<{ connected: boolean; connection?: any } | null>(null);
  const [xStatus, setXStatus] = useState<{ connected: boolean; connection?: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<'youtube' | 'x' | null>(null);
  const [disconnecting, setDisconnecting] = useState<'youtube' | 'x' | null>(null);

  useEffect(() => {
    loadConnectionStatus();
  }, []);

  const loadConnectionStatus = async () => {
    try {
      setLoading(true);
      const [youtube, x] = await Promise.all([
        snsService.getConnectionStatus('youtube').catch(() => ({ connected: false })),
        snsService.getConnectionStatus('x').catch(() => ({ connected: false })),
      ]);
      setYoutubeStatus(youtube);
      setXStatus(x);
    } catch (error: any) {
      console.error('Failed to load connection status:', error);
      toast.error('Failed to load connection status');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (platform: 'youtube' | 'x') => {
    try {
      setConnecting(platform);
      
      if (platform === 'youtube') {
        const authUrl = await snsService.getYouTubeAuthUrl();
        // Open in new window for OAuth flow
        window.location.href = authUrl;
      } else {
        const authUrl = await snsService.getXAuthUrl();
        // codeVerifier is stored server-side using state parameter
        window.location.href = authUrl;
      }
    } catch (error: any) {
      console.error(`Failed to initiate ${platform} connection:`, error);
      toast.error(`Failed to connect ${platform}: ${error.message}`);
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform: 'youtube' | 'x') => {
    if (!confirm(`Are you sure you want to disconnect your ${platform === 'youtube' ? 'YouTube' : 'X'} account?`)) {
      return;
    }

    try {
      setDisconnecting(platform);
      await snsService.disconnect(platform);
      toast.success(`${platform === 'youtube' ? 'YouTube' : 'X'} account disconnected`);
      await loadConnectionStatus();
    } catch (error: any) {
      console.error(`Failed to disconnect ${platform}:`, error);
      toast.error(`Failed to disconnect: ${error.message}`);
    } finally {
      setDisconnecting(null);
    }
  };

  // Check for OAuth callback success/error
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const platform = urlParams.get('platform');
    const status = urlParams.get('status');
    const message = urlParams.get('message');

    if (platform && status) {
      if (status === 'success') {
        toast.success(`${platform === 'youtube' ? 'YouTube' : 'X'} account connected successfully!`);
        loadConnectionStatus();
      } else if (status === 'error') {
        toast.error(`Failed to connect ${platform}: ${message || 'Unknown error'}`);
      }

      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">SNS Settings</h1>
          <p className="text-muted-foreground">Connect your YouTube and X (Twitter) accounts for video distribution</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* YouTube Connection Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Youtube className="h-6 w-6 text-red-600" />
                    <div>
                      <CardTitle>YouTube</CardTitle>
                      <CardDescription>Connect your YouTube channel</CardDescription>
                    </div>
                  </div>
                  {youtubeStatus?.connected ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Not Connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {youtubeStatus?.connected && youtubeStatus.connection && (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Channel:</span>{' '}
                      <span className="font-medium">{youtubeStatus.connection.accountName || 'N/A'}</span>
                    </div>
                    {youtubeStatus.connection.accountEmail && (
                      <div>
                        <span className="text-muted-foreground">Email:</span>{' '}
                        <span className="font-medium">{youtubeStatus.connection.accountEmail}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  {youtubeStatus?.connected ? (
                    <Button
                      variant="outline"
                      onClick={() => handleDisconnect('youtube')}
                      disabled={disconnecting === 'youtube'}
                      className="flex-1"
                    >
                      {disconnecting === 'youtube' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        <>
                          <Unlink className="mr-2 h-4 w-4" />
                          Disconnect
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleConnect('youtube')}
                      disabled={connecting === 'youtube'}
                      className="flex-1"
                    >
                      {connecting === 'youtube' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Link2 className="mr-2 h-4 w-4" />
                          Connect YouTube
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* X Connection Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Twitter className="h-6 w-6 text-blue-400" />
                    <div>
                      <CardTitle>X (Twitter)</CardTitle>
                      <CardDescription>Connect your X account</CardDescription>
                    </div>
                  </div>
                  {xStatus?.connected ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Not Connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {xStatus?.connected && xStatus.connection && (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Account:</span>{' '}
                      <span className="font-medium">{xStatus.connection.accountName || 'N/A'}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {xStatus?.connected ? (
                    <Button
                      variant="outline"
                      onClick={() => handleDisconnect('x')}
                      disabled={disconnecting === 'x'}
                      className="flex-1"
                    >
                      {disconnecting === 'x' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        <>
                          <Unlink className="mr-2 h-4 w-4" />
                          Disconnect
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleConnect('x')}
                      disabled={connecting === 'x'}
                      className="flex-1"
                    >
                      {connecting === 'x' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Link2 className="mr-2 h-4 w-4" />
                          Connect X
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Connect your YouTube and/or X accounts above</p>
            <p>2. Complete video generation and assembly</p>
            <p>3. Request distribution from the video timeline editor</p>
            <p>4. Admin will review and approve your request</p>
            <p>5. Video will automatically upload to selected platforms</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
