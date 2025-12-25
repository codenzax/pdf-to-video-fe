import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/pages/Dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Upload,
  ArrowRight,
  Eye,
  Code,
  RotateCcw,
  X,
  Home,
  Video,
  Image as ImageIcon,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { grobidApi, CompleteExtractedData, LLMExtractionResponse } from '@/services/grobidApi';
import { geminiService, ScriptData } from '@/services/geminiService';
import { ScriptSelection } from '@/components/script-generation/ScriptSelection';
import { SimpleScriptEditor } from '@/components/script-generation/SimpleScriptEditor';
import { ImageViewer } from '@/components/script-generation/ImageViewer';
import { ThesisSessionList } from '@/components/ThesisSessionList';
import { thesisSessionService, ThesisSession } from '@/services/thesisSessionService';
import { distributionService } from '@/services/distributionService';
import { snsService } from '@/services/snsService';

// Helper: Convert blob URL to base64
const blobUrlToBase64 = async (blobUrl: string): Promise<string | undefined> => {
  try {
    if (!blobUrl || (!blobUrl.startsWith('blob:') && !blobUrl.startsWith('data:'))) {
      return undefined;
    }
    
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Extract base64 data (remove data:video/mp4;base64, prefix)
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Failed to convert blob URL to base64:', error);
    return undefined;
  }
};

// Helper: Convert base64 to blob URL
const base64ToBlobUrl = (base64: string, mimeType: string): string => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
};

// Convert blob URLs to base64 before saving to database
// CRITICAL: Preserve ALL data - never lose information
const convertBlobsToBase64ForDB = async (script: ScriptData | null): Promise<ScriptData | null> => {
  if (!script) return null;
  
  const processedSentences = await Promise.all(
    script.sentences.map(async (s) => {
      // PRESERVE existing base64 first (from database restore)
      let videoBase64: string | undefined = s.visual?.videoBase64;
      let imageBase64: string | undefined = s.visual?.imageBase64;
      let videoUrl = s.visual?.videoUrl;
      let imageUrl = s.visual?.imageUrl;
      let thumbnailUrl = s.visual?.thumbnailUrl;
      
      // Only convert blob URLs to base64 if we don't already have base64
      if (s.visual?.videoUrl && !videoBase64) {
        if (s.visual.videoUrl.startsWith('blob:') || s.visual.videoUrl.startsWith('data:')) {
          const base64 = await blobUrlToBase64(s.visual.videoUrl);
          if (base64) {
            videoBase64 = base64;
            videoUrl = undefined; // Remove blob URL, keep base64
          }
        } else if (s.visual.videoUrl.startsWith('http://') || s.visual.videoUrl.startsWith('https://')) {
          videoUrl = s.visual.videoUrl; // Keep HTTP/HTTPS URLs
        }
      }
      
      if (s.visual?.imageUrl && !imageBase64) {
        if (s.visual.imageUrl.startsWith('blob:') || s.visual.imageUrl.startsWith('data:')) {
          const base64 = await blobUrlToBase64(s.visual.imageUrl);
          if (base64) {
            imageBase64 = base64;
            imageUrl = undefined;
          }
        } else if (s.visual.imageUrl.startsWith('http://') || s.visual.imageUrl.startsWith('https://')) {
          imageUrl = s.visual.imageUrl;
        }
      }
      
      // PRESERVE existing audio base64
      let audioBase64 = s.audio?.audioBase64;
      let audioUrl = s.audio?.audioUrl;
      
      // Only convert blob URLs to base64 if we don't already have base64
      if (s.audio?.audioUrl && !audioBase64) {
        if (s.audio.audioUrl.startsWith('blob:') || s.audio.audioUrl.startsWith('data:')) {
          const base64 = await blobUrlToBase64(s.audio.audioUrl);
          if (base64) {
            audioBase64 = base64;
            audioUrl = undefined;
          }
        } else if (s.audio.audioUrl.startsWith('http://') || s.audio.audioUrl.startsWith('https://')) {
          audioUrl = s.audio.audioUrl;
        }
      }
      
      // PRESERVE ALL visual properties
      const visual = s.visual ? {
        ...s.visual, // Spread all existing properties first
        videoUrl, // Update URL (might be undefined if converted to base64)
        imageUrl, // Update URL (might be undefined if converted to base64)
        thumbnailUrl, // Preserve thumbnail
        videoBase64: videoBase64 || s.visual.videoBase64, // Preserve or use converted base64
        imageBase64: imageBase64 || s.visual.imageBase64, // Preserve or use converted base64
        approved: s.visual.approved === true || s.visual.status === 'approved',
        status: (s.visual.status === 'approved' || s.visual.approved) ? 'approved' as const : (s.visual.status || 'pending') as 'pending' | 'generating' | 'completed' | 'failed' | 'approved' | 'rejected',
        // Preserve all other properties explicitly
        videoId: s.visual.videoId,
        mode: s.visual.mode,
        transitionType: s.visual.transitionType,
        subtitleSettings: s.visual.subtitleSettings,
        subtitleText: s.visual.subtitleText,
        uploaded: s.visual.uploaded,
        prompt: s.visual.prompt,
      } : s.visual;
      
      // PRESERVE ALL audio properties
      const audio = s.audio ? {
        ...s.audio, // Spread all existing properties first
        audioUrl, // Update URL (might be undefined if converted to base64)
        audioBase64: audioBase64 || s.audio.audioBase64, // Preserve or use converted base64
        approved: s.audio.approved === true || s.audio.status === 'approved',
        status: (s.audio.status === 'approved' || s.audio.approved) ? 'approved' as const : (s.audio.status || 'pending') as 'pending' | 'generating' | 'completed' | 'failed' | 'approved' | 'rejected',
        // Preserve other audio properties
        duration: s.audio.duration,
        isCustom: s.audio.isCustom,
      } : s.audio;
      
      return {
        ...s, // Spread all sentence properties
        visual,
        audio,
      };
    })
  );
  
  // PRESERVE finalVideo and backgroundMusic
  let finalVideo = script.finalVideo;
  if (script.finalVideo?.videoUrl && !script.finalVideo.videoBase64) {
    if (script.finalVideo.videoUrl.startsWith('blob:') || script.finalVideo.videoUrl.startsWith('data:')) {
      const base64 = await blobUrlToBase64(script.finalVideo.videoUrl);
      if (base64) {
        finalVideo = {
          ...script.finalVideo,
          videoBase64: base64,
          videoUrl: undefined,
        };
      }
    }
  }
  
  let backgroundMusic = script.backgroundMusic;
  if (script.backgroundMusic?.audioUrl && !script.backgroundMusic.audioBase64) {
    if (script.backgroundMusic.audioUrl.startsWith('blob:') || script.backgroundMusic.audioUrl.startsWith('data:')) {
      const base64 = await blobUrlToBase64(script.backgroundMusic.audioUrl);
      if (base64) {
        backgroundMusic = {
          ...script.backgroundMusic,
          audioBase64: base64,
          audioUrl: undefined,
        };
      }
    }
  }
  
  return {
    ...script, // Spread all script properties
    sentences: processedSentences,
    finalVideo: finalVideo || script.finalVideo,
    backgroundMusic: backgroundMusic || script.backgroundMusic,
  };
};

// Convert base64 back to blob URLs when loading from database
// CRITICAL: Preserve videoBase64 field so backend can use it - only create blob URLs for frontend display
const convertBase64ToBlobsFromDB = (script: ScriptData | null): ScriptData | null => {
  if (!script) return null;
  
  return {
    ...script,
    sentences: script.sentences.map(s => {
      const visual = s.visual ? {
        ...s.visual,
        // Preserve original HTTP/HTTPS URLs, only create blob URLs if we have base64 but no URL
        videoUrl: s.visual.videoUrl && (s.visual.videoUrl.startsWith('http://') || s.visual.videoUrl.startsWith('https://'))
          ? s.visual.videoUrl
          : (s.visual.videoBase64 ? base64ToBlobUrl(s.visual.videoBase64, 'video/mp4') : s.visual.videoUrl),
        imageUrl: s.visual.imageUrl && (s.visual.imageUrl.startsWith('http://') || s.visual.imageUrl.startsWith('https://'))
          ? s.visual.imageUrl
          : (s.visual.imageBase64 ? base64ToBlobUrl(s.visual.imageBase64, 'image/png') : s.visual.imageUrl),
        thumbnailUrl: s.visual.thumbnailUrl || s.visual.imageUrl || (s.visual.imageBase64 ? base64ToBlobUrl(s.visual.imageBase64, 'image/png') : undefined),
        // CRITICAL: Preserve videoBase64 and imageBase64 - backend needs these!
        videoBase64: s.visual.videoBase64,
        imageBase64: s.visual.imageBase64,
        approved: s.visual.approved === true || s.visual.status === 'approved',
        status: (s.visual.status === 'approved' || s.visual.approved) ? 'approved' as const : (s.visual.status || 'pending') as 'pending' | 'generating' | 'completed' | 'failed' | 'approved' | 'rejected',
      } : s.visual;
      
      const audio = s.audio ? {
        ...s.audio,
        audioUrl: s.audio.audioUrl && (s.audio.audioUrl.startsWith('http://') || s.audio.audioUrl.startsWith('https://'))
          ? s.audio.audioUrl
          : (s.audio.audioBase64 ? base64ToBlobUrl(s.audio.audioBase64, 'audio/mpeg') : s.audio.audioUrl),
        // CRITICAL: Preserve audioBase64 - backend needs this!
        audioBase64: s.audio.audioBase64,
        approved: s.audio.approved === true || s.audio.status === 'approved',
        status: (s.audio.status === 'approved' || s.audio.approved) ? 'approved' as const : (s.audio.status || 'pending') as 'pending' | 'generating' | 'completed' | 'failed' | 'approved' | 'rejected',
      } : s.audio;
      
      return {
        ...s,
        visual,
        audio,
      };
    }),
    // CRITICAL: Convert finalVideo base64 back to blob URL for frontend display
    finalVideo: script.finalVideo ? {
      ...script.finalVideo,
      videoUrl: script.finalVideo.videoUrl || (script.finalVideo.videoBase64 ? base64ToBlobUrl(script.finalVideo.videoBase64, 'video/mp4') : undefined),
      // Preserve videoBase64 and export status - backend needs videoBase64!
      videoBase64: script.finalVideo.videoBase64,
      isExported: script.finalVideo.isExported,
      exportedAt: script.finalVideo.exportedAt,
    } : script.finalVideo,
    // Convert backgroundMusic base64 back to blob URL
    backgroundMusic: script.backgroundMusic ? {
      ...script.backgroundMusic,
      audioUrl: script.backgroundMusic.audioUrl || (script.backgroundMusic.audioBase64 ? base64ToBlobUrl(script.backgroundMusic.audioBase64, 'audio/mpeg') : undefined),
      // Preserve audioBase64 - backend needs this!
      audioBase64: script.backgroundMusic.audioBase64,
      volume: script.backgroundMusic.volume,
      approved: script.backgroundMusic.approved,
    } : script.backgroundMusic,
  };
};

interface ProcessingStep {
  id: string;
  title: string;
  status: "pending" | "processing" | "completed" | "error";
  description: string;
}

type WorkflowStep = 'upload' | 'extract' | 'preview' | 'script-selection' | 'script-editing' | 'video-generation';

// SessionStorage key for persistence
const PDF_TO_VIDEO_STORAGE_KEY = 'pdf_to_video_workflow_data';

// Save minimal workflow state to sessionStorage (only lightweight metadata)
// Large data (scripts, extractedData) is stored in database via thesis sessions
const saveWorkflowState = (data: {
  currentStep: WorkflowStep;
  sessionId: string | null;
  thesisSessionId: string | null;
}) => {
  try {
    // Only save minimal metadata - no large data
    const minimalData = {
      currentStep: data.currentStep,
      sessionId: data.sessionId,
      thesisSessionId: data.thesisSessionId,
      timestamp: Date.now(), // For cache invalidation
    };
    
    const serialized = JSON.stringify(minimalData);
    const sizeInKB = new Blob([serialized]).size / 1024;
    
    // Should be well under 1KB with minimal data
    if (sizeInKB > 10) {
      console.warn('⚠️ Workflow state is larger than expected:', sizeInKB.toFixed(2), 'KB');
    }
    
    sessionStorage.setItem(PDF_TO_VIDEO_STORAGE_KEY, serialized);
    console.log('💾 Saved minimal workflow state to sessionStorage:', {
      step: data.currentStep,
      hasSessionId: !!data.sessionId,
      hasThesisSessionId: !!data.thesisSessionId,
    });
  } catch (e: any) {
    console.error('❌ Failed to save workflow state to sessionStorage:', e);
    if (e.name === 'QuotaExceededError') {
      console.error('SessionStorage quota exceeded! This should not happen with minimal data. Clearing old data...');
      // Try to clear and retry once
      try {
        sessionStorage.removeItem(PDF_TO_VIDEO_STORAGE_KEY);
        const minimalData = {
          currentStep: data.currentStep,
          sessionId: data.sessionId,
          thesisSessionId: data.thesisSessionId,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(PDF_TO_VIDEO_STORAGE_KEY, JSON.stringify(minimalData));
        console.log('✅ Retried save after clearing old data');
      } catch (retryError) {
        console.error('❌ Failed to save even after clearing:', retryError);
      }
    }
  }
};

// Load minimal workflow state from sessionStorage
// Full state restoration happens via database (thesis sessions) if thesisSessionId exists
const loadWorkflowState = () => {
  try {
    const saved = sessionStorage.getItem(PDF_TO_VIDEO_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      
      // Validate it's the new format (has timestamp) or old format
      if (parsed.timestamp) {
        // New format - minimal data
        const ageInHours = (Date.now() - parsed.timestamp) / (1000 * 60 * 60);
        if (ageInHours > 24) {
          // Data older than 24 hours, clear it
          console.log('🗑️ Clearing stale workflow state (older than 24 hours)');
          sessionStorage.removeItem(PDF_TO_VIDEO_STORAGE_KEY);
          return null;
        }
        
        console.log('📂 Restored minimal workflow state from sessionStorage:', {
        step: parsed.currentStep,
          hasSessionId: !!parsed.sessionId,
          hasThesisSessionId: !!parsed.thesisSessionId,
          ageHours: ageInHours.toFixed(1),
      });
      return parsed;
      } else {
        // Old format - migrate to new format by keeping only minimal data
        console.log('🔄 Migrating old workflow state format to minimal format');
        const minimal = {
          currentStep: parsed.currentStep || 'upload',
          sessionId: parsed.sessionId || null,
          thesisSessionId: parsed.thesisSessionId || null,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(PDF_TO_VIDEO_STORAGE_KEY, JSON.stringify(minimal));
        return minimal;
      }
    }
  } catch (e) {
    console.warn('Failed to load workflow state from sessionStorage:', e);
    // Clear corrupted data
    try {
      sessionStorage.removeItem(PDF_TO_VIDEO_STORAGE_KEY);
    } catch (clearError) {
      // Ignore clear errors
    }
  }
  return null;
};

export default function PdfToVideoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionIdFromUrl = searchParams.get('sessionId');
  
  // Try to restore minimal state from sessionStorage on mount
  const savedState = loadWorkflowState();
  
  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(savedState?.currentStep || 'upload');

  // PDF Upload & Extraction state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<CompleteExtractedData | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(savedState?.sessionId || null);
  const [thesisSessionId, setThesisSessionId] = useState<string | null>(savedState?.thesisSessionId || null);
  const [error, setError] = useState<string | null>(null);
  const [showSessionList, setShowSessionList] = useState(false);
  const [listRefreshTrigger, setListRefreshTrigger] = useState(0);

  // Script Generation state (no longer restored from sessionStorage - use database)
  const [threeScripts, setThreeScripts] = useState<ScriptData[]>([]);
  const [selectedScript, setSelectedScript] = useState<ScriptData | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Image Viewer state
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [viewingImages, setViewingImages] = useState<CompleteExtractedData['images']>([]);
  
  // Distribution dialog state
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [distributionReason, setDistributionReason] = useState('');
  const [creatingDistribution, setCreatingDistribution] = useState(false);
  const [completedVideoBase64, setCompletedVideoBase64] = useState<string | null>(null);
  const [completedSessionTitle, setCompletedSessionTitle] = useState<string>('');

  // Track last save time to prevent too frequent saves
  const lastSaveTimeRef = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save state to thesis session at each step (with rate limit protection)
  const saveStateToSession = async () => {
    if (!thesisSessionId) return; // Only save if we have a session

    try {
      // Determine current stage based on workflow step
      let currentStage = 'pdf_extraction';
      if (currentStep === 'script-selection' || currentStep === 'script-editing') {
        currentStage = threeScripts.length > 0 ? 'script_selection' : 'script_generation';
      } else if (currentStep === 'video-generation') {
        currentStage = 'video_generation';
      } else if (currentStep === 'preview') {
        currentStage = 'pdf_extraction';
      }

      // Prepare script data to save - convert blob URLs to base64
      // CRITICAL: Always save complete script data to ensure nothing is lost
      let scriptDataToSave = null;
      if (threeScripts.length > 0 || selectedScript) {
        try {
          // Convert all scripts with full data preservation
          const convertedScripts = threeScripts.length > 0 
            ? await Promise.all(threeScripts.map(async (s) => {
                try {
                  const converted = await convertBlobsToBase64ForDB(s);
                  return converted;
                } catch (e) {
                  console.error('Error converting script:', e);
                  // If conversion fails, return original (it may already have base64)
                  return s;
                }
              }))
            : [];
          
          let convertedSelectedScript = null;
          if (selectedScript) {
            try {
              convertedSelectedScript = await convertBlobsToBase64ForDB(selectedScript);
            } catch (e) {
              console.error('Error converting selected script:', e);
              convertedSelectedScript = selectedScript; // Fallback to original
            }
          }
          
          scriptDataToSave = {
            scripts: convertedScripts.filter(s => s !== null) as ScriptData[],
            selectedScript: convertedSelectedScript,
          };
          
          console.log('💾 Saving script data:', {
            scriptsCount: scriptDataToSave.scripts.length,
            hasSelectedScript: !!scriptDataToSave.selectedScript,
          });
        } catch (e) {
          console.error('Error preparing script data:', e);
          // Fallback: save original data (may have base64 already)
          scriptDataToSave = {
            scripts: threeScripts,
            selectedScript: selectedScript,
          };
        }
      }

      // Save with complete data - ALWAYS save extractedData and scriptData
      await thesisSessionService.updateSession(thesisSessionId, {
        currentStage,
        extractedData: extractedData || null, // Explicitly save extractedData
        scriptData: scriptDataToSave, // Save script data
      });
      
      console.log('✅ Successfully saved session data:', {
        sessionId: thesisSessionId,
        currentStage,
        hasExtractedData: !!extractedData,
        hasScriptData: !!scriptDataToSave,
        scriptsCount: scriptDataToSave?.scripts?.length || 0,
        hasSelectedScript: !!scriptDataToSave?.selectedScript,
      });

      // Create checkpoint at key stages (only once per stage - skip if rate limited)
      if (currentStep === 'script-selection' && threeScripts.length > 0) {
        try {
          await thesisSessionService.createCheckpoint(thesisSessionId, {
            stageName: 'script_generation',
            stageData: {
              extractedData,
              scriptData: scriptDataToSave,
            },
          });
        } catch (err: any) {
          // Checkpoint might already exist or rate limited - ignore
          if (err.response?.status !== 429) {
            console.warn('Failed to create checkpoint:', err.message);
          }
        }
      } else if (currentStep === 'script-editing' && selectedScript) {
        try {
          await thesisSessionService.createCheckpoint(thesisSessionId, {
            stageName: 'script_selection',
            stageData: {
              extractedData,
              scriptData: scriptDataToSave,
            },
          });
        } catch (err: any) {
          // Checkpoint might already exist or rate limited - ignore
          if (err.response?.status !== 429) {
            console.warn('Failed to create checkpoint:', err.message);
          }
        }
      }

      console.log('💾 State saved to thesis session:', { thesisSessionId, currentStage, currentStep });
    } catch (error: any) {
      // Handle 404 - session was deleted, clear invalid session ID
      if (error.response?.status === 404 || error.message?.includes('not found')) {
        console.log('ℹ️ Session not found during save (may have been deleted), clearing invalid session ID');
        setThesisSessionId(null);
        // Clear from sessionStorage
        const savedState = loadWorkflowState();
        if (savedState) {
          saveWorkflowState({
            currentStep: savedState.currentStep,
            sessionId: savedState.sessionId,
            thesisSessionId: null,
          });
        }
        return;
      }
      
      // Rate limit errors are expected, don't log
      if (error.response?.status === 429) {
        return;
      }
      
      // Suppress timeout and network errors
      const isNetworkError = error.code?.includes('ERR_NETWORK') || error.message?.includes('ERR_CONNECTION_REFUSED') || error.message?.includes('Network Error');
      const isTimeoutError = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      if (!isNetworkError && !isTimeoutError) {
        console.warn('⚠️ Failed to save state to session:', error.message);
      }
    }
  };

  // Auto-save minimal workflow state to sessionStorage (only lightweight metadata)
  // Full state is persisted in database via thesis sessions
  useEffect(() => {
    saveWorkflowState({
      currentStep,
      sessionId,
      thesisSessionId,
    });
  }, [currentStep, sessionId, thesisSessionId]);

  // Handle sessionId from URL parameter (when navigating from History page)
  useEffect(() => {
    if (sessionIdFromUrl && !thesisSessionId) {
      // User clicked resume from History page - load the session
      handleResumeSessionById(sessionIdFromUrl);
    }
  }, [sessionIdFromUrl]);

  const handleResumeSessionById = async (sessionId: string) => {
    try {
      toast.info('Loading session...');
      const session = await thesisSessionService.getSession(sessionId);
      await handleResumeSessionDirect(session);
      // Clear URL parameter after loading
      window.history.replaceState({}, '', '/pdf-to-video');
    } catch (error: any) {
      // Handle 404 - session doesn't exist
      if (error.response?.status === 404 || error.message?.includes('not found')) {
        toast.error('Session not found. It may have been deleted.');
        // Clear URL parameter
        window.history.replaceState({}, '', '/pdf-to-video');
        return;
      }
      
      // Handle other errors
      console.error('Failed to load session from URL:', error);
      toast.error('Failed to load session: ' + (error.message || 'Unknown error'));
      // Clear URL parameter on error too
      window.history.replaceState({}, '', '/pdf-to-video');
    }
  };

  const handleResumeSessionDirect = async (session: ThesisSession) => {
    // Clear existing state first to ensure clean restoration
    setExtractedData(null);
    setThreeScripts([]);
    setSelectedScript(null);
    setThesisSessionId(null);
    
    // Set session ID
    setThesisSessionId(session.id);
    
    // Restore extracted data
    if (session.extractedData) {
      console.log('✅ Restoring extracted data');
      setExtractedData(session.extractedData);
    }
    
    // Restore script data if available
    if (session.scriptData) {
      const scriptData = session.scriptData as any;
      console.log('📝 Processing scriptData:', {
        hasScripts: !!scriptData.scripts,
        scriptsLength: scriptData.scripts?.length,
        hasSelectedScript: !!scriptData.selectedScript,
      });
      
      // Restore three scripts - convert base64 back to blob URLs
      if (scriptData.scripts && Array.isArray(scriptData.scripts) && scriptData.scripts.length > 0) {
        console.log('✅ Restoring scripts:', scriptData.scripts.length);
        const restoredScripts = scriptData.scripts.map((s: any) => convertBase64ToBlobsFromDB(s)).filter((s: any) => s !== null) as ScriptData[];
        setThreeScripts(restoredScripts);
      }
      
      // Restore selected script - convert base64 back to blob URLs
      if (scriptData.selectedScript) {
        console.log('✅ Restoring selected script');
        const restoredSelectedScript = convertBase64ToBlobsFromDB(scriptData.selectedScript);
        if (restoredSelectedScript) {
          setSelectedScript(restoredSelectedScript);
        }
      }
    }
    
    // Determine current step based on stage and available data
    let targetStep: WorkflowStep = 'preview';
    
    const scriptData = session.scriptData as any;
    const hasScripts = scriptData?.scripts?.length > 0;
    const hasSelectedScript = !!scriptData?.selectedScript;
    
    if (hasSelectedScript) {
      targetStep = 'script-editing';
    } else if (hasScripts) {
      targetStep = 'script-selection';
    } else if (session.extractedData) {
      targetStep = 'preview';
    } else {
      targetStep = 'upload';
    }
    
    console.log('📍 Resuming to step:', targetStep);
    setCurrentStep(targetStep);
    setShowSessionList(false);
    
    toast.success(`Resumed from "${session.title || 'session'}"`);
  };

  // Restore full state from database if thesisSessionId exists (on mount or when it changes)
  // NOTE: This is now mainly for initial page load - handleResumeSession handles session restoration
  useEffect(() => {
    const restoreFromDatabase = async () => {
      // Only restore on initial mount if we have a thesisSessionId and no extractedData yet
      // Skip if handleResumeSession just ran (it handles restoration itself)
      if (thesisSessionId && !extractedData && !sessionIdFromUrl) {
        try {
          console.log('🔄 Restoring thesis session from database:', thesisSessionId);
          const session = await thesisSessionService.getSession(thesisSessionId);
          
          // Restore extracted data
          if (session.extractedData) {
            setExtractedData(session.extractedData);
          }
          
          // Restore script data - convert base64 back to blob URLs
          if (session.scriptData) {
            const scriptData = session.scriptData as any;
            if (scriptData.scripts && Array.isArray(scriptData.scripts) && scriptData.scripts.length > 0) {
              const restoredScripts = scriptData.scripts.map((s: any) => convertBase64ToBlobsFromDB(s)).filter((s: any) => s !== null) as ScriptData[];
              setThreeScripts(restoredScripts);
            }
            if (scriptData.selectedScript) {
              const restoredSelectedScript = convertBase64ToBlobsFromDB(scriptData.selectedScript);
              if (restoredSelectedScript) {
                setSelectedScript(restoredSelectedScript);
              }
            }
          }
          
          // Update current step based on restored state
          const hasScripts = (session.scriptData as any)?.scripts?.length > 0;
          const hasSelectedScript = !!(session.scriptData as any)?.selectedScript;
          
          if (hasSelectedScript) {
            setCurrentStep('script-editing');
          } else if (hasScripts) {
            setCurrentStep('script-selection');
          } else if (session.extractedData) {
            setCurrentStep('preview');
          }
          
          console.log('✅ Restored thesis session from database');
        } catch (error: any) {
          // Don't show error to user - they can continue normally
          // Suppress timeout and network errors (backend slow/unavailable) to reduce console noise
          const isNetworkError = error.code?.includes('ERR_NETWORK') || error.message?.includes('ERR_CONNECTION_REFUSED') || error.message?.includes('Network Error');
          const isTimeoutError = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
          if (!isNetworkError && !isTimeoutError) {
            console.error('❌ Failed to restore thesis session from database:', error);
          }
        }
      }
    };
    
    restoreFromDatabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thesisSessionId]); // Only run when thesisSessionId changes (on mount or when resumed)

  // REMOVED: Auto-save useEffect - saves are now only triggered explicitly on user actions
  // This prevents continuous updates every few seconds
  // Saves happen explicitly in:
  // - handleExtractCompleteData (after PDF extraction)
  // - handleGenerateScripts (after script generation)
  // - handleSelectScript (after script selection)
  // - handleScriptUpdate (after approving visuals/audio)
  // - handleVideoExport (after video export)

  const steps: ProcessingStep[] = [
    {
      id: "upload",
      title: "File Upload",
      status: uploadedFile ? "completed" : "pending",
      description: "Upload and validate PDF file",
    },
    {
      id: "llm",
      title: "LLM Processing",
      status: "pending",
      description: "Extract data using advanced LLM",
    },
    {
      id: "metadata",
      title: "Metadata Extraction",
      status: "pending",
      description: "Extract title, authors, journal info",
    },
    {
      id: "sections",
      title: "Sections Extraction",
      status: "pending",
      description: "Extract abstract, methodology, results, etc.",
    },
    {
      id: "complete",
      title: "Complete",
      status: "pending",
      description: "Finalize extraction and prepare data",
    },
  ];

  const handleFileUpload = (file: File | null) => {
    setUploadedFile(file);
    setError(null);
    setExtractedData(null);
    setSessionId(null);
    setThreeScripts([]);
    setSelectedScript(null);

    if (file) {
      setCurrentStep('extract');
    } else {
      setCurrentStep('upload');
    }

    // Update the first step status
    setProcessingSteps((prev) =>
      prev.map((step) =>
        step.id === "upload" ? { ...step, status: file ? "completed" as const : "pending" as const } : step
      )
    );
  };

  const handleResetWorkflow = () => {
    setUploadedFile(null);
    setExtractedData(null);
    setSessionId(null);
    setThesisSessionId(null);
    setThreeScripts([]);
    setSelectedScript(null);
    setProcessingSteps([]);
    setError(null);
    setCurrentStep('upload');
    setShowSessionList(false);
    toast.info('Workflow reset - start over with a new PDF');
  };

  const handleResumeSession = async (session: ThesisSession) => {
    await handleResumeSessionDirect(session);
  };

  const handleNewSession = () => {
    handleResetWorkflow();
    setShowSessionList(false);
  };

  const handleReExtract = async () => {
    if (!uploadedFile) {
      toast.error('No PDF file available');
      return;
    }

    setExtractedData(null);
    setSessionId(null);
    setThreeScripts([]);
    setSelectedScript(null);
    setProcessingSteps([]);
    setError(null);

    // Automatically start re-extraction
    await startProcessing();
  };

  const handleRegenerateScripts = () => {
    setThreeScripts([]);
    setSelectedScript(null);
    toast.info('Generate new script variations');
  };

  const startProcessing = async () => {
    if (!uploadedFile) {
      toast.error("Please upload a PDF file first");
      return;
    }

    setIsProcessing(true);
    setProcessingSteps(steps);
    setError(null);

    try {
      // Step 1: LLM Processing
      setProcessingSteps((prev) =>
        prev.map((step) =>
          step.id === "llm"
            ? { ...step, status: "processing" as const }
            : step
        )
      );

      toast.info("Starting LLM extraction...");

      const response: LLMExtractionResponse = await grobidApi.extractCompleteData(uploadedFile);

      console.log('📥 Extraction response:', {
        status: response.status,
        hasThesisSessionId: !!response.data?.thesisSessionId,
        thesisSessionId: response.data?.thesisSessionId,
        hasExtractedData: !!response.data?.extractedData,
        fullResponse: response,
      });

      if (response.status === "success") {
        setExtractedData(response.data.extractedData);
        setSessionId(response.data.sessionId);
        
        // Capture thesisSessionId if available (from backend auto-creation)
        // Response structure: { status, message, data: { thesisSessionId, ... } }
        const thesisSessionId = response.data.thesisSessionId;
        if (thesisSessionId) {
          console.log('✅ Thesis session created:', thesisSessionId);
          setThesisSessionId(thesisSessionId);
          toast.success("Thesis session saved! You can continue later.");
          // Refresh the list to show the new session - force immediate refresh
          setTimeout(() => {
            setListRefreshTrigger(prev => prev + 1);
          }, 500);
        } else {
          console.warn('⚠️ No thesisSessionId in response - session may not have been created');
          console.log('Response structure:', {
            status: response.status,
            hasData: !!response.data,
            dataKeys: response.data ? Object.keys(response.data) : [],
            fullResponse: JSON.stringify(response, null, 2),
          });
          
          // Try to load sessions anyway - maybe it was created but not returned
          setTimeout(() => {
            setListRefreshTrigger(prev => prev + 1);
          }, 1000);
        }

        // Mark all steps as completed
        setProcessingSteps((prev) =>
          prev.map((step) => ({ ...step, status: "completed" as const }))
        );

        toast.success("LLM extraction completed successfully!");
        setCurrentStep('preview');
        setShowSessionList(false); // Hide list after starting new extraction
        
        // Save state after extraction (if session exists) - immediate save allowed
        if (thesisSessionId) {
          setTimeout(() => {
            lastSaveTimeRef.current = Date.now();
            saveStateToSession();
          }, 1000);
        }
      } else {
        throw new Error(response.message || 'Extraction failed');
      }

    } catch (error) {
      console.error("Processing error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`Extraction failed: ${errorMessage}`);

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

  const handleGenerateScripts = async () => {
    if (!extractedData) {
      toast.error('No extracted data available');
      return;
    }

    setIsGeneratingScript(true);
    try {
      // Convert extractedData to JsonData format
      const jsonData = {
        metadata: {
          ...extractedData.metadata,
          abstract: extractedData.sections.abstract
        },
        sections: extractedData.sections,
        images: extractedData.images.map(img => ({
          caption: img.caption || img.title || '',
          description: img.description,
          category: img.category,
          key_insights: img.key_insights,
          data_points: img.data_points,
        })),
        tables: extractedData.tables.map(t => ({ caption: t.title, data: t.data }))
      };

      const scripts = await geminiService.generate3Scripts(jsonData);
      setThreeScripts(scripts);
      setCurrentStep('script-selection');
      
      // Save state to session after scripts are generated (immediate save)
      if (thesisSessionId) {
        lastSaveTimeRef.current = Date.now();
        await saveStateToSession();
      }
      
      toast.success('3 scripts generated successfully!');
    } catch (error) {
      console.error('Error generating scripts:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate scripts');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleSelectScript = async (script: ScriptData) => {
    setSelectedScript(script);
    setCurrentStep('script-editing');
    
    // Save state to session after script is selected (immediate save)
    if (thesisSessionId) {
      lastSaveTimeRef.current = Date.now();
      await saveStateToSession();
    }
    
    toast.success('You can now edit and approve sentences');
  };

  const handleBackToSelection = () => {
    setCurrentStep('script-selection');
    setSelectedScript(null);
  };

  const handleRegenerateScript = async () => {
    if (!extractedData || !selectedScript) {
      toast.error('Missing data for regeneration');
      return;
    }

    setIsGeneratingScript(true);
    try {
      const jsonData = {
        metadata: {
          ...extractedData.metadata,
          abstract: extractedData.sections.abstract
        },
        sections: extractedData.sections,
        tables: extractedData.tables.map(t => ({ caption: t.title, data: t.data })),
        images: extractedData.images.map(i => ({
          caption: i.caption || i.title || '',
          description: i.description,
          category: i.category,
          key_insights: i.key_insights,
          data_points: i.data_points,
        }))
      };

      const regeneratedScript = await geminiService.regenerateUnapprovedSentences(jsonData, selectedScript);
      setSelectedScript(regeneratedScript);
      toast.success('Unapproved sentences regenerated successfully!');
    } catch (error) {
      console.error('Error regenerating script:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate script');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleApproveSentence = (sentenceId: string) => {
    if (!selectedScript) return;

    const updatedSentences = selectedScript.sentences.map(sentence =>
      sentence.id === sentenceId ? { ...sentence, approved: true } : sentence
    );

    const updatedScript = {
      ...selectedScript,
      sentences: updatedSentences
    };

    setSelectedScript(updatedScript);
    
    // Save immediately when script is updated
    if (thesisSessionId) {
      // Use a debounced save to avoid multiple rapid saves
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        lastSaveTimeRef.current = Date.now();
        saveStateToSession();
      }, 1000); // 1 second debounce
    }
  };

  const handleScriptUpdate = (updatedScript: ScriptData) => {
    // Sync visual/audio updates back to parent state for persistence
    const approvedVisualsCount = updatedScript.sentences.filter(
      s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl)
    ).length;
    
    console.log('🔄 handleScriptUpdate called:', {
      totalSentences: updatedScript.sentences.length,
      approvedVisuals: updatedScript.sentences.filter(s => s.visual?.approved === true).length,
      approvedVisualsWithVideo: approvedVisualsCount,
      approvedAudio: updatedScript.sentences.filter(s => s.audio?.approved === true).length,
      scriptId: updatedScript.id || 'default',
    });
    
    // CRITICAL: Update state immediately - this will trigger re-render and pass updated prop to SimpleScriptEditor
    setSelectedScript(updatedScript);
    
    // Log detailed approved visuals info
    if (approvedVisualsCount > 0) {
      console.log('✅ Approved visuals details:', updatedScript.sentences
        .filter(s => s.visual?.approved === true && (s.visual?.videoUrl || s.visual?.imageUrl))
        .map(s => ({
          id: s.id.substring(0, 8),
          approved: s.visual?.approved,
          hasVideoUrl: !!s.visual?.videoUrl,
          hasImageUrl: !!s.visual?.imageUrl,
          videoUrl: s.visual?.videoUrl ? s.visual.videoUrl.substring(0, 50) + '...' : 'NO',
          imageUrl: s.visual?.imageUrl ? s.visual.imageUrl.substring(0, 50) + '...' : 'NO',
        }))
      );
    }
    
    // Save when videos/visuals/audio are approved or updated (with debounce)
    if (thesisSessionId) {
      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Debounce to avoid multiple rapid saves
      saveTimeoutRef.current = setTimeout(() => {
        lastSaveTimeRef.current = Date.now();
        saveStateToSession();
      }, 1000); // 1 second debounce
    }
    
    if (approvedVisualsCount > 0 && currentStep === 'script-editing') {
      console.log('✅ Approved visuals detected:', approvedVisualsCount, '- VideoTimelineEditor should show them');
    }
  };

  const handleExportScript = (data: ScriptData) => {
    const paperTitle = extractedData?.metadata?.title || 'Untitled Paper';
    const exportData = geminiService.exportScript(data, paperTitle);
    geminiService.downloadScript(exportData);
  };

  // Handle video export from VideoTimelineEditor
  const handleVideoExport = async (_videoUrl: string, videoBase64: string) => {
    console.log('🟢 handleVideoExport called with videoBase64 length:', videoBase64?.length || 0);
    console.log('🟢 thesisSessionId:', thesisSessionId);
    
    if (!thesisSessionId) {
      toast.error('No session found. Please create a session first.');
      return;
    }

    // Get session title immediately (lightweight call is fast)
    console.log('🟢 Getting session title...');
    let sessionTitle = 'Untitled Thesis';
    try {
      const session = await thesisSessionService.getSession(thesisSessionId, true); // Lightweight mode
      if (session.title) {
        sessionTitle = session.title;
      }
    } catch (e) {
      console.warn('Failed to get session title:', e);
    }
    
    // IMMEDIATELY store video data and show dialog - don't wait for DB save
    console.log('🟢 Storing video data and showing dialog immediately...');
    setCompletedVideoBase64(videoBase64);
    setCompletedSessionTitle(sessionTitle); // Use actual thesis title
    
    // Show dialog IMMEDIATELY
    setShowReasonDialog(true);
    toast.success('✅ Video ready! Please provide reason for distribution.');
    console.log('🟢 Reason dialog shown immediately');

    // Save to database in background (non-blocking)
    (async () => {
      try {
        console.log('🟢 [Background] Getting full session for saving...');
        const fullSession = await thesisSessionService.getSession(thesisSessionId, false);
        console.log('🟢 [Background] Full session retrieved');
        
        // Parse scriptData if it's a string, otherwise use as-is
        let currentScriptData: any = {};
        if (fullSession.scriptData) {
          if (typeof fullSession.scriptData === 'string') {
            try {
              currentScriptData = JSON.parse(fullSession.scriptData);
            } catch (e) {
              console.error('Failed to parse scriptData:', e);
              currentScriptData = {};
            }
          } else {
            currentScriptData = fullSession.scriptData;
          }
        }

        // Update scriptData to include final video
        const updatedScriptData = {
          ...currentScriptData,
          finalVideo: {
            videoBase64: videoBase64,
            exportedAt: new Date().toISOString(),
            isExported: true,
          },
        };

        // Parse videoLogs if it's a string, otherwise use as-is
        let currentVideoLogs: any = {};
        if (fullSession.videoLogs) {
          if (typeof fullSession.videoLogs === 'string') {
            try {
              currentVideoLogs = JSON.parse(fullSession.videoLogs);
            } catch (e) {
              console.error('Failed to parse videoLogs:', e);
              currentVideoLogs = {};
            }
          } else {
            currentVideoLogs = fullSession.videoLogs;
          }
        }

        // Update videoLogs to mark as exported
        const updatedVideoLogs = {
          ...currentVideoLogs,
          finalVideo: {
            videoBase64: videoBase64,
            exportedAt: new Date().toISOString(),
            isExported: true,
          },
        };

        // Save to session (background, non-blocking)
        console.log('🟢 [Background] Saving to session...');
        await thesisSessionService.updateSession(thesisSessionId, {
          scriptData: updatedScriptData,
          videoLogs: updatedVideoLogs,
          currentStage: 'video_completed',
        });
        console.log('🟢 [Background] Session updated successfully');
      } catch (error: any) {
        console.error('⚠️ [Background] Failed to save session (non-blocking):', error);
        // Don't block dialog - user can still create distribution request
      }
    })();
  };


  const handleCreateDistributionRequest = async () => {
    if (!thesisSessionId || !distributionReason.trim()) {
      toast.error('Please provide a reason for distribution');
      return;
    }

    try {
      setCreatingDistribution(true);

      // Use stored video base64 (avoid expensive DB query with large JSON)
      const videoBase64 = completedVideoBase64;
      if (!videoBase64) {
        toast.error('Video data not found. Please complete the video again.');
        setShowReasonDialog(false);
        return;
      }

      // Check SNS connections
      const [youtubeStatus, xStatus] = await Promise.all([
        snsService.getConnectionStatus('youtube').catch(() => ({ connected: false })),
        snsService.getConnectionStatus('x').catch(() => ({ connected: false })),
      ]);

      const platforms: ('youtube' | 'x')[] = [];
      if (youtubeStatus.connected) platforms.push('youtube');
      if (xStatus.connected) platforms.push('x');

      if (platforms.length === 0) {
        toast.error('Please connect at least one platform (YouTube or X) in Settings first');
        setShowReasonDialog(false);
        navigate('/dashboard/settings/sns');
        return;
      }

      // Get thesis description from session (abstract or description from extractedData)
      let thesisDescription = '';
      try {
        const fullSession = await thesisSessionService.getSession(thesisSessionId, false); // Get full session for extractedData
        if (fullSession.extractedData) {
          const extracted = typeof fullSession.extractedData === 'string' 
            ? JSON.parse(fullSession.extractedData) 
            : fullSession.extractedData;
          thesisDescription = extracted.metadata?.abstract || extracted.sections?.abstract || extracted.sections?.description || '';
        }
      } catch (e) {
        console.warn('Failed to get thesis description:', e);
      }

      // Create distribution request
      // Title = thesis title (from session)
      // Description = thesis abstract/description (NOT the reason)
      // Store reason in xSettings.requestReason (shown to admin separately)
      const requestPayload = {
        thesisSessionId: thesisSessionId,
        videoUrl: `data:video/mp4;base64,${videoBase64}`,
        title: completedSessionTitle || 'Untitled Thesis',
        description: thesisDescription, // Thesis abstract/description, NOT the reason
        platforms: platforms,
        youtubeSettings: { privacy: 'private' as 'public' | 'private' | 'unlisted' },
        xSettings: {
          requestReason: distributionReason.trim(), // Store reason separately in xSettings
        },
      };
      
      console.log('📤 Creating distribution request with reason:', {
        hasReason: !!distributionReason.trim(),
        reasonLength: distributionReason.trim().length,
        xSettings: requestPayload.xSettings,
      });
      
      await distributionService.createRequest(requestPayload);

      toast.success('✅ Distribution request created successfully!');
      setShowReasonDialog(false);
      setDistributionReason('');
      setCompletedVideoBase64(null); // Clear stored video data
      setCompletedSessionTitle('');
      
      // Stay on same page - do NOT navigate away
    } catch (error: any) {
      console.error('Failed to create distribution request:', error);
      toast.error('Failed to create distribution request: ' + (error.message || 'Unknown error'));
    } finally {
      setCreatingDistribution(false);
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

  const downloadData = () => {
    if (extractedData) {
      const dataStr = JSON.stringify(extractedData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `extracted_data_${sessionId || 'unknown'}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Data downloaded successfully!');
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

  // Step indicator component
  const StepIndicator = ({ step, label, status }: { step: number; label: string; status: 'completed' | 'current' | 'pending' }) => (
    <div className="flex items-center">
      <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
        status === 'completed' ? 'bg-green-600 border-green-600 text-white' :
        status === 'current' ? 'bg-primary border-primary text-white' :
        'bg-muted border-muted-foreground text-muted-foreground'
      }`}>
        {status === 'completed' ? <CheckCircle className="h-5 w-5" /> : step}
      </div>
      <span className={`ml-2 text-sm font-medium ${
        status === 'current' ? 'text-foreground' : 'text-muted-foreground'
      }`}>{label}</span>
    </div>
  );

  const getStepStatus = (stepName: WorkflowStep): 'completed' | 'current' | 'pending' => {
    const stepOrder: WorkflowStep[] = ['upload', 'extract', 'preview', 'script-selection', 'script-editing', 'video-generation'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepName);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
          <h1 className="text-3xl font-bold tracking-tight">PDF to Video Workflow</h1>
          <p className="text-muted-foreground">
            Complete workflow: Upload PDF → Extract Data → Generate Script → Edit Script → Generate Video → Export
          </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setShowSessionList(!showSessionList);
                // Force refresh when showing the list
                if (!showSessionList) {
                  setTimeout(() => {
                    setListRefreshTrigger(prev => prev + 1);
                  }, 100);
                }
              }}
            >
              <History className="h-4 w-4 mr-2" />
              {showSessionList ? 'Hide' : 'Show'} History
            </Button>
          </div>
        </div>

        {/* Thesis Session List */}
        {showSessionList && (
          <ThesisSessionList
            onSelectSession={handleResumeSession}
            onNewSession={handleNewSession}
            currentSessionId={thesisSessionId}
            refreshTrigger={listRefreshTrigger}
          />
        )}

        {/* Step Progress Indicator */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center flex-1">
                <StepIndicator step={1} label="Upload PDF" status={getStepStatus('upload')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={2} label="Extract Data" status={getStepStatus('extract')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={3} label="Preview Data" status={getStepStatus('preview')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={4} label="Select Script" status={getStepStatus('script-selection')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={5} label="Edit Script" status={getStepStatus('script-editing')} />
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                <StepIndicator step={6} label="Generate Video" status={getStepStatus('video-generation')} />
              </div>
              {currentStep !== 'upload' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetWorkflow}
                  className="ml-4"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Start Over
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* STEP 1 & 2: Upload and Extract */}
        {(currentStep === 'upload' || currentStep === 'extract') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {currentStep === 'upload' ? 'Step 1: Upload PDF' : 'Step 2: Extract Data'}
              </CardTitle>
              <CardDescription>
                {currentStep === 'upload'
                  ? 'Select an academic PDF file to begin the workflow'
                  : 'Extract academic data from your PDF using LLM processing'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload Section */}
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (file && file.type === 'application/pdf') {
                      handleFileUpload(file);
                    } else {
                      toast.error('Please select a valid PDF file');
                    }
                  }}
                  className="hidden"
                  id="file-upload"
                  accept=".pdf"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center space-y-4"
                >
                  <div className="p-3 rounded-full bg-muted">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">
                      Upload PDF File
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Click to select a PDF file for processing
                    </p>
                  </div>
                  {/* <Button variant="outline" size="sm" type="button">
                    Choose PDF File
                  </Button> */}
                </label>
              </div>

              {/* Uploaded File Info */}
              {uploadedFile && (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={startProcessing}
                      disabled={isProcessing}
                      size="sm"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Start Extraction'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFileUpload(null)}
                      disabled={isProcessing}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}

              {/* Processing Steps */}
              {processingSteps.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  {processingSteps.map((step) => (
                    <div key={step.id} className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {getStepIcon(step.status)}
                      </div>
                      <div className="flex-1">
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
                    </div>
                  ))}
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="space-y-3">
                  <div className="flex items-start space-x-2 p-3 border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">Processing Error</p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">{error}</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleReExtract}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retry Extraction
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 3: Preview Extracted Data */}
        {currentStep === 'preview' && extractedData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Step 3: Preview Extracted Data
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReExtract}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Re-extract
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(extractedData, null, 2))}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadData}
                  >
                    <Code className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                Review the extracted data or re-extract if needed before generating scripts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Tabs for Data and JSON view */}
              <Tabs defaultValue="data" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="data">Formatted Data</TabsTrigger>
                  <TabsTrigger value="json">Raw JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="data" className="space-y-4 mt-4">
                  {/* Metadata Section */}
                  <div className="space-y-3 p-4 border rounded-lg">
                    <h4 className="text-lg font-semibold">Paper Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Title</h5>
                        <p className="text-sm mt-1">{extractedData.metadata.title}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Authors</h5>
                        <p className="text-sm mt-1">
                          {extractedData.metadata.authors.map(a => `${a.firstName} ${a.lastName}`).join(', ')}
                        </p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Journal</h5>
                        <p className="text-sm mt-1">{extractedData.metadata.journal || 'N/A'}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Year</h5>
                        <p className="text-sm mt-1">{extractedData.metadata.year || 'N/A'}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">DOI</h5>
                        <p className="text-sm mt-1">{extractedData.metadata.doi || 'N/A'}</p>
                      </div>
                      <div>
                        <h5 className="font-medium text-sm text-muted-foreground">Keywords</h5>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {extractedData.metadata.keywords.map((keyword, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{keyword}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sections Display */}
                  <div className="space-y-3 p-4 border rounded-lg">
                    <h4 className="text-lg font-semibold">Academic Sections</h4>
                    <div className="space-y-3">
                      {Object.entries(extractedData.sections).map(([sectionName, content]) => {
                        // Get categorized images for this section
                        const sectionImages = extractedData.images.filter(img => {
                          if (sectionName.toLowerCase() === 'methodology') {
                            return img.category === 'methodology'
                          } else if (sectionName.toLowerCase() === 'results') {
                            return img.category === 'results'
                          }
                          return false
                        })

                        return (
                          <div key={sectionName} className="border rounded-lg p-3 bg-muted/20">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-medium capitalize text-sm">{sectionName}</h5>
                              {sectionImages.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {sectionImages.length} {sectionImages.length === 1 ? 'image' : 'images'}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
                              {content || 'No content available'}
                            </p>
                            
                            {/* Display categorized images for Methodology and Results */}
                            {(sectionName.toLowerCase() === 'methodology' || sectionName.toLowerCase() === 'results') && sectionImages.length > 0 && (
                              <div className="mt-3 pt-3 border-t">
                                <div className="flex items-center gap-2 mb-2">
                                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs font-medium text-muted-foreground">Figures ({sectionImages.length})</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {sectionImages.map((img, idx) => (
                                    <Button
                                      key={img.id || idx}
                                      variant="outline"
                                      size="sm"
                                      className="h-auto p-2 flex flex-col items-start text-left hover:bg-accent"
                                      onClick={() => {
                                        setViewingImages(sectionImages)
                                        setCurrentImageIndex(idx)
                                        setImageViewerOpen(true)
                                      }}
                                    >
                                      <div className="flex items-center gap-2 w-full">
                                        <ImageIcon className="h-4 w-4 text-primary flex-shrink-0" />
                                        <span className="text-xs font-medium truncate flex-1">
                                          {img.caption || img.title || `Figure ${idx + 1}`}
                                        </span>
                                      </div>
                                      {img.description && (
                                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1 w-full">
                                          {img.description}
                                        </p>
                                      )}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Tables and Images Summary */}
                  {(extractedData.tables.length > 0 || extractedData.images.length > 0) && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border">
                      <h4 className="font-medium text-sm mb-2">Additional Data</h4>
                      <p className="text-xs text-muted-foreground">
                        {extractedData.tables.length > 0 && `${extractedData.tables.length} table(s) `}
                        {extractedData.images.length > 0 && `${extractedData.images.length} image(s) `}
                        included in the data
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="json" className="mt-4">
                  <div className="relative">
                    <div className="bg-slate-950 p-4 rounded-lg max-h-[500px] overflow-auto">
                      <pre className="text-xs text-slate-100 font-mono whitespace-pre-wrap break-words">
                        <code className="language-json">{JSON.stringify(extractedData, null, 2)}</code>
                      </pre>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700"
                      onClick={() => {
                        copyToClipboard(JSON.stringify(extractedData, null, 2));
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Action Buttons */}
              <div className="pt-4 border-t flex gap-2">
                <Button
                  onClick={handleReExtract}
                  variant="outline"
                  disabled={isGeneratingScript}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject & Re-extract
                </Button>
                <Button
                  onClick={handleGenerateScripts}
                  disabled={isGeneratingScript}
                  size="lg"
                  className="flex-[2]"
                >
                  {isGeneratingScript ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating 3 Scripts...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Accept & Generate Scripts
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 4: Script Selection */}
        {currentStep === 'script-selection' && threeScripts.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Step 4: Select Your Script</CardTitle>
                  <CardDescription>
                    Choose from 3 generated script variations or regenerate for new options
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    handleRegenerateScripts();
                    await handleGenerateScripts();
                  }}
                  disabled={isGeneratingScript}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Regenerate All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScriptSelection
                scripts={threeScripts}
                onSelect={handleSelectScript}
              />
            </CardContent>
          </Card>
        )}

        {/* STEP 5: Script Editor */}
        {currentStep === 'script-editing' && selectedScript && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Step 5: Edit & Approve Script</CardTitle>
                    <CardDescription>
                      Review, edit, and approve your final script
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                  <Button variant="outline" onClick={handleBackToSelection}>
                    ← Back to Selection
                  </Button>
                    <Button 
                      onClick={() => setCurrentStep('video-generation')}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Next: Generate Videos
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
            <SimpleScriptEditor
              key={`editor-video-${selectedScript.id || 'default'}-${selectedScript.sentences.filter(s => s.visual?.approved === true).length}`}
              scriptData={selectedScript}
              onApprove={handleApproveSentence}
              onRegenerate={handleRegenerateScript}
              onExport={handleExportScript}
              onVideoExport={handleVideoExport}
              onScriptUpdate={handleScriptUpdate}
              isLoading={isGeneratingScript}
              tables={extractedData?.tables.map(t => ({ title: t.title, data: t.data }))}
              images={extractedData?.images
                .filter(i => i.category === 'methodology' || i.category === 'results')
                .map(i => ({ title: i.title || i.caption || '', description: i.description }))}
            />
          </div>
        )}

        {/* STEP 6: Video Generation */}
        {currentStep === 'video-generation' && selectedScript && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    <div>
                      <CardTitle>Step 6: Generate Videos</CardTitle>
                      <CardDescription>
                        Generate professional videos for each sentence in your script
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCurrentStep('script-editing')}>
                      ← Back to Edit
                    </Button>
                    <Button 
                      onClick={() => selectedScript && handleExportScript(selectedScript)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Export Final Video
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
            <SimpleScriptEditor
              key={`editor-video-${selectedScript.id || 'default'}-${selectedScript.sentences.filter(s => s.visual?.approved === true).length}`}
              scriptData={selectedScript}
              onApprove={handleApproveSentence}
              onRegenerate={handleRegenerateScript}
              onExport={handleExportScript}
              onVideoExport={handleVideoExport}
              onScriptUpdate={handleScriptUpdate}
              isLoading={isGeneratingScript}
              tables={extractedData?.tables.map(t => ({ title: t.title, data: t.data }))}
              images={extractedData?.images
                .filter(i => i.category === 'methodology' || i.category === 'results')
                .map(i => ({
                  title: i.caption || i.title || '',
                  description: i.description,
                  category: i.category,
                }))}
            />
          </div>
        )}

        {/* Image Viewer */}
        {extractedData && sessionId && (
          <ImageViewer
            images={viewingImages}
            currentIndex={currentImageIndex}
            isOpen={imageViewerOpen}
            onClose={() => setImageViewerOpen(false)}
            onNext={() => {
              if (currentImageIndex < viewingImages.length - 1) {
                setCurrentImageIndex(currentImageIndex + 1)
              }
            }}
            onPrevious={() => {
              if (currentImageIndex > 0) {
                setCurrentImageIndex(currentImageIndex - 1)
              }
            }}
            sessionId={sessionId}
          />
        )}
      </div>
      
      {/* Reason Dialog - Asks for distribution reason */}
      <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Distribution</DialogTitle>
            <DialogDescription>
              Please provide a reason for distributing this video.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Textarea
                id="reason"
                placeholder="Enter the reason for distributing this video..."
                value={distributionReason}
                onChange={(e) => setDistributionReason(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowReasonDialog(false);
                setDistributionReason('');
              }}
              disabled={creatingDistribution}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDistributionRequest}
              disabled={creatingDistribution || !distributionReason.trim()}
            >
              {creatingDistribution ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
    );
  }