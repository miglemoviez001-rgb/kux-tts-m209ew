import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mic, Play, Download, Trash2, Sparkles, Search, Loader2,
  CheckCircle2, XCircle, Zap, RefreshCw, Clock, X, Settings,
  ChevronDown, Volume2, Eye, DownloadCloud, Music, Scissors,
  Hash, FileText, AlertCircle, Copy, Check, AudioLines
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Types ─── */
interface TtsPart {
  id: number;
  text: string;
  charCount: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
  audioUrl?: string;
  audioSize?: number;
}

type WorkflowStatus = 'idle' | 'triggering' | 'queued' | 'in_progress' | 'completed' | 'failed';

interface GitHubAccount {
  id: string;
  label: string;
  token: string;
  repo: string;
  owner: string;
  status: 'unchecked' | 'valid' | 'invalid';
}

/* ─── Constants ─── */
const KYUTAI_VOICES = [
  'Show host (US, m)',
  'Calming (US, f)',
  'Calming (US, m)',
  'Confused (US, f)',
  'Confused (US, m)',
  'Default (US, f)',
  'Desire (US, f)',
  'Desire (US, m)',
  'Fearful (US, f)',
  'Jazz radio (US, m)',
  'Narration (US, f)',
  'Sad (IE, m)',
  'Sad (US, f)',
  'Sarcastic (US, f)',
  'Sarcastic (US, m)',
  'Whisper (US, f)',
];

const MAX_CHARS = 15000;
const DEFAULT_CHUNK_SIZE = 500;

/* ═══════════════════════════════════════════════════════════
   WAVE BACKGROUND ANIMATION
   ═══════════════════════════════════════════════════════════ */
const WaveBackground: React.FC<{ active: boolean }> = ({ active }) => {
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden opacity-30">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${30 + i * 15}%`,
            background: `linear-gradient(180deg, transparent, ${i % 2 === 0 ? 'rgba(6,182,212,0.08)' : 'rgba(168,85,247,0.06)'})`,
            borderRadius: '50% 50% 0 0',
          }}
          animate={{
            x: ['-5%', '5%', '-5%'],
            scaleY: [1, 1.05, 1],
          }}
          transition={{
            duration: 4 + i * 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.3,
          }}
        />
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   AUDIO PLAYER MINI
   ═══════════════════════════════════════════════════════════ */
const AudioPlayer: React.FC<{ url: string; partNum: number }> = ({ url, partNum }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={url} onEnded={() => setIsPlaying(false)} />
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isPlaying
          ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
          : 'bg-white/10 text-slate-400 hover:text-white hover:bg-white/20'
          }`}
      >
        {isPlaying ? <Volume2 className="w-4 h-4" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <span className="text-[10px] text-slate-500">Part {partNum}</span>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════ */
export const App: React.FC = () => {
  // ─── Text & Parts ───
  const [inputText, setInputText] = useState('');
  const [parts, setParts] = useState<TtsPart[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('Show host (US, m)');
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_SIZE);

  // ─── GitHub Account ───
  const [accounts, setAccounts] = useState<GitHubAccount[]>(() => {
    const saved = localStorage.getItem('kux_tts_accounts');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAccountSetup, setShowAccountSetup] = useState(false);
  const [newAccount, setNewAccount] = useState({ label: '', token: '', repo: '', owner: '' });

  // ─── Workflow State ───
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('idle');
  const [workflowRunId, setWorkflowRunId] = useState<number | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);

  // ─── Downloads ───
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // ─── UI ───
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [copiedPart, setCopiedPart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Save accounts to localStorage
  useEffect(() => {
    localStorage.setItem('kux_tts_accounts', JSON.stringify(accounts));
  }, [accounts]);

  // ─── Text Splitting ───
  const splitText = useCallback((text: string, maxChars: number): TtsPart[] => {
    if (!text.trim()) return [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if ((current + ' ' + trimmed).trim().length > maxChars && current.length > 0) {
        chunks.push(current.trim());
        current = trimmed;
      } else {
        current = (current + ' ' + trimmed).trim();
      }
    }
    if (current.trim()) chunks.push(current.trim());
    if (chunks.length === 0) {
      for (let i = 0; i < text.length; i += maxChars) {
        chunks.push(text.substring(i, i + maxChars).trim());
      }
    }

    return chunks.map((chunk, idx) => ({
      id: idx + 1,
      text: chunk,
      charCount: chunk.length,
      status: 'pending' as const,
    }));
  }, []);

  // Auto-split when text or chunkSize changes
  useEffect(() => {
    if (inputText.trim()) {
      setParts(splitText(inputText, chunkSize));
    } else {
      setParts([]);
    }
  }, [inputText, chunkSize, splitText]);

  // ─── GitHub API ───
  const getActiveAccount = (): GitHubAccount | null => {
    if (activeAccountId) return accounts.find(a => a.id === activeAccountId) || null;
    return accounts[0] || null;
  };

  async function ghApi(method: string, path: string, body?: object): Promise<any> {
    const account = getActiveAccount();
    if (!account) throw new Error('No GitHub account configured');

    const res = await fetch(`https://api.github.com/repos/${account.owner}/${account.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${account.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    return res.json();
  }

  // ─── Account Management ───
  const addAccount = () => {
    if (!newAccount.label || !newAccount.token || !newAccount.repo || !newAccount.owner) return;
    const acc: GitHubAccount = {
      id: Date.now().toString(),
      ...newAccount,
      status: 'unchecked',
    };
    setAccounts(prev => [...prev, acc]);
    setNewAccount({ label: '', token: '', repo: '', owner: '' });
    setShowAccountSetup(false);
  };

  const removeAccount = (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    if (activeAccountId === id) setActiveAccountId(null);
  };

  const verifyAccount = async (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;

    try {
      const res = await fetch(`https://api.github.com/repos/${acc.owner}/${acc.repo}`, {
        headers: { Authorization: `Bearer ${acc.token}`, Accept: 'application/vnd.github+json' },
      });
      setAccounts(prev =>
        prev.map(a => a.id === id ? { ...a, status: res.ok ? 'valid' : 'invalid' } : a)
      );
    } catch {
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'invalid' } : a));
    }
  };

  // ─── Start TTS Generation ───
  const startGeneration = async () => {
    const account = getActiveAccount();
    if (!account) { setShowAccountSetup(true); return; }
    if (parts.length === 0) { setStatusMessage('No text to generate!'); return; }

    try {
      setWorkflowStatus('triggering');
      setStatusMessage('Uploading text to GitHub...');
      setStartTime(Date.now());
      setDownloadUrl(null);

      // Update parts status
      setParts(prev => prev.map(p => ({ ...p, status: 'pending' as const })));

      // Build the input JSON
      const inputJson = JSON.stringify({
        text: inputText,
        voice: selectedVoice,
        chunkSize: chunkSize,
      }, null, 2);

      // Get current file SHA (may not exist yet)
      let sha: string | undefined;
      try {
        const fileData = await ghApi('GET', '/contents/automation/tts-input.json');
        sha = fileData?.sha;
      } catch { }

      const putBody: any = {
        message: `tts: ${parts.length} parts, voice: ${selectedVoice}`,
        content: btoa(unescape(encodeURIComponent(inputJson))),
        branch: 'main',
      };
      if (sha) putBody.sha = sha;

      await ghApi('PUT', '/contents/automation/tts-input.json', putBody);
      setStatusMessage('Triggering TTS workflow...');

      // Trigger the workflow
      await ghApi('POST', '/actions/workflows/tts-audio.yml/dispatches', {
        ref: 'main',
        inputs: { voice: selectedVoice },
      });

      setWorkflowStatus('queued');
      setStatusMessage('Workflow queued — waiting for GitHub runner...');

      // Find the workflow run after a delay
      setTimeout(async () => {
        try {
          const data = await ghApi('GET', '/actions/runs?per_page=1&branch=main');
          const run = data?.workflow_runs?.[0];
          if (run) {
            setWorkflowRunId(run.id);
            setWorkflowStatus(run.status === 'queued' ? 'queued' : 'in_progress');
            setStatusMessage(run.status === 'queued'
              ? 'Queued — waiting for runner...'
              : `Generating audio... (Run #${run.run_number})`
            );
          }
        } catch { }
      }, 8000);

    } catch (err: any) {
      setWorkflowStatus('failed');
      setStatusMessage('Error: ' + (err.message || 'Unknown'));
    }
  };

  // ─── Poll Status ───
  const pollStatus = useCallback(async () => {
    if (!workflowRunId) return;
    const account = getActiveAccount();
    if (!account) return;

    try {
      const run = await ghApi('GET', `/actions/runs/${workflowRunId}`);
      if (run?.status === 'completed') {
        if (run.conclusion === 'success') {
          setWorkflowStatus('completed');
          setStatusMessage('🎉 All audio generated successfully!');
          setParts(prev => prev.map(p => ({ ...p, status: 'done' as const })));

          // Fetch artifacts
          const arts = await ghApi('GET', `/actions/runs/${workflowRunId}/artifacts`);
          if (arts?.artifacts?.length > 0) {
            const audioArt = arts.artifacts.find((a: any) => a.name === 'generated-audio');
            if (audioArt) {
              setDownloadUrl(audioArt.archive_download_url);
            }
          }
        } else {
          setWorkflowStatus('failed');
          setStatusMessage(`Workflow ${run.conclusion}. Check GitHub logs.`);
          setParts(prev => prev.map(p => ({ ...p, status: 'failed' as const })));
        }
      } else {
        setWorkflowStatus(run?.status === 'queued' ? 'queued' : 'in_progress');
        setStatusMessage(run?.status === 'queued'
          ? 'Queued — waiting for runner...'
          : 'Generating audio...'
        );

        // Simulate parts processing based on elapsed time
        if (startTime) {
          const elapsed = (Date.now() - startTime) / 1000;
          const estimatedPerPart = 30; // ~30s per part
          const doneParts = Math.min(Math.floor(elapsed / estimatedPerPart), parts.length - 1);
          setParts(prev => prev.map((p, i) => ({
            ...p,
            status: i < doneParts ? 'done' : i === doneParts ? 'processing' : 'pending',
          })));
        }
      }
    } catch { }
  }, [workflowRunId, startTime, parts.length]);

  useEffect(() => {
    if (workflowStatus === 'in_progress' || workflowStatus === 'queued') {
      const interval = setInterval(pollStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [workflowStatus, pollStatus]);

  // ─── Download ───
  const handleDownload = async () => {
    const account = getActiveAccount();
    if (!downloadUrl || !account) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setDownloadProgress(p => Math.min(p + 5, 90));
      }, 200);

      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${account.token}`, Accept: 'application/vnd.github+json' },
        redirect: 'follow',
      });

      clearInterval(progressInterval);
      setDownloadProgress(95);

      if (res.ok) {
        const blob = await res.blob();
        setDownloadProgress(100);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kux-tts-audio.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setTimeout(() => { setIsDownloading(false); setDownloadProgress(0); }, 1500);
      }
    } catch {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  // ─── Helpers ───
  const charCount = inputText.length;
  const charPercent = Math.min((charCount / MAX_CHARS) * 100, 100);
  const isRendering = ['triggering', 'queued', 'in_progress'].includes(workflowStatus);

  const copyPartText = (text: string, partId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedPart(partId);
    setTimeout(() => setCopiedPart(null), 2000);
  };

  const clearAll = () => {
    setInputText('');
    setParts([]);
    setWorkflowStatus('idle');
    setWorkflowRunId(null);
    setStatusMessage('');
    setStartTime(null);
    setDownloadUrl(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 selection:bg-cyan-500/30 relative" style={{ fontFamily: "'Inter', sans-serif" }}>
      <WaveBackground active={isRendering} />

      {/* ─── NAVBAR ─── */}
      <nav className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20"
              animate={isRendering ? {
                scale: [1, 1.1, 1],
                boxShadow: ['0 10px 25px rgba(6,182,212,0.2)', '0 10px 35px rgba(168,85,247,0.4)', '0 10px 25px rgba(6,182,212,0.2)']
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <AudioLines className="text-white w-5 h-5" />
            </motion.div>
            <div>
              <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 tracking-tight">
                KUX TTS
              </span>
              <span className="hidden sm:inline text-[10px] text-slate-500 ml-2 font-medium">Kyutai 1.6B Bulk Audio</span>
            </div>
            {isRendering && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="ml-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold uppercase tracking-wider"
              >
                Generating...
              </motion.span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAccountSetup(!showAccountSetup)}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/30 text-slate-400 hover:text-white transition-all flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              {accounts.length > 0 ? `${accounts.length} Account${accounts.length > 1 ? 's' : ''}` : 'Setup Account'}
            </button>
          </div>
        </div>
      </nav>

      {/* ─── ACCOUNT SETUP MODAL ─── */}
      <AnimatePresence>
        {showAccountSetup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => setShowAccountSetup(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#121214] border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-cyan-400" />
                  GitHub Account Setup
                </h3>
                <button onClick={() => setShowAccountSetup(false)} className="p-1.5 hover:bg-white/5 rounded-lg">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Add your GitHub account with a PAT token (repo + workflow scope).
                The repo should contain this project's code with the <code className="text-cyan-400">tts-audio.yml</code> workflow.
              </p>

              {/* Existing accounts */}
              {accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-2">
                  <div className={`w-2 h-2 rounded-full ${acc.status === 'valid' ? 'bg-green-400' : acc.status === 'invalid' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{acc.label}</div>
                    <div className="text-[10px] text-slate-500">{acc.owner}/{acc.repo}</div>
                  </div>
                  <button onClick={() => verifyAccount(acc.id)}
                    className="text-[10px] px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors">
                    Verify
                  </button>
                  <button onClick={() => removeAccount(acc.id)}
                    className="p-1 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Add new account form */}
              <div className="mt-4 space-y-3 p-4 rounded-xl bg-white/[0.02] border border-dashed border-white/10">
                <h4 className="text-sm font-semibold text-white">Add Account</h4>
                <input
                  placeholder="Label (e.g. Account 1)"
                  value={newAccount.label}
                  onChange={e => setNewAccount(p => ({ ...p, label: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  placeholder="GitHub Username/Owner"
                  value={newAccount.owner}
                  onChange={e => setNewAccount(p => ({ ...p, owner: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  placeholder="Repository Name (e.g. kux-tts)"
                  value={newAccount.repo}
                  onChange={e => setNewAccount(p => ({ ...p, repo: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/50"
                />
                <input
                  type="password"
                  placeholder="GitHub PAT Token (ghp_xxx or github_pat_xxx)"
                  value={newAccount.token}
                  onChange={e => setNewAccount(p => ({ ...p, token: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-cyan-500/50"
                />
                <button
                  onClick={addAccount}
                  disabled={!newAccount.label || !newAccount.token || !newAccount.repo || !newAccount.owner}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl font-semibold text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Add Account
                </button>
              </div>

              {/* Setup Instructions */}
              <div className="mt-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <h4 className="text-sm font-semibold text-amber-400 mb-2">📋 Setup Steps (Copy-Paste):</h4>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                  <li>Go to <span className="text-cyan-400">github.com/new</span> → Create repo "kux-tts"</li>
                  <li>Push this project code to that repo</li>
                  <li>Go to <span className="text-cyan-400">Settings → Developer Settings → PAT (fine-grained)</span></li>
                  <li>Create token with <strong className="text-white">repo + workflow</strong> permissions</li>
                  <li>Paste the token above and click "Verify"</li>
                </ol>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── MAIN CONTENT ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative z-10">
        <div className="grid lg:grid-cols-5 gap-8">

          {/* ═══ LEFT PANEL: Input + Voice ═══ */}
          <div className="lg:col-span-3 space-y-5">

            {/* Voice Selection */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <button
                  onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-[#121214] border border-white/10 rounded-xl text-sm hover:border-cyan-500/30 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-cyan-400" />
                    <span>{selectedVoice}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showVoiceDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -5, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.98 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-[#161618] border border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto"
                    >
                      {KYUTAI_VOICES.map(v => (
                        <button
                          key={v}
                          onClick={() => { setSelectedVoice(v); setShowVoiceDropdown(false); }}
                          className={`w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 transition-colors flex items-center gap-2 ${v === selectedVoice ? 'text-cyan-400 bg-cyan-500/5' : 'text-slate-300'}`}
                        >
                          {v === selectedVoice && <Check className="w-3.5 h-3.5" />}
                          <span className={v === selectedVoice ? '' : 'ml-5'}>{v}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Chunk Size */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[#121214] border border-white/10 rounded-xl">
                <Scissors className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Chunk</span>
                <select
                  value={chunkSize}
                  onChange={e => setChunkSize(Number(e.target.value))}
                  className="bg-transparent text-sm text-white font-mono focus:outline-none cursor-pointer"
                >
                  <option value={200} className="bg-[#121214]">200</option>
                  <option value={300} className="bg-[#121214]">300</option>
                  <option value={500} className="bg-[#121214]">500</option>
                  <option value={800} className="bg-[#121214]">800</option>
                  <option value={1000} className="bg-[#121214]">1000</option>
                </select>
              </div>
            </div>

            {/* Text Input */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={e => {
                  if (e.target.value.length <= MAX_CHARS) setInputText(e.target.value);
                }}
                placeholder="Paste your full script here (up to 15,000 characters). It will be automatically split into parts for TTS generation..."
                className="relative w-full h-[400px] bg-[#121214] border border-white/10 rounded-2xl p-5 text-sm leading-relaxed focus:outline-none focus:border-cyan-500/40 transition-all resize-none placeholder:text-slate-600 shadow-2xl font-[inherit]"
              />

              {/* Char counter */}
              <div className="absolute bottom-3 right-4 flex items-center gap-3">
                {inputText && (
                  <button onClick={clearAll} className="text-[10px] text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors">
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${charPercent > 90 ? 'bg-red-500' : charPercent > 70 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                      animate={{ width: `${charPercent}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono ${charPercent > 90 ? 'text-red-400' : 'text-slate-500'}`}>
                    {charCount.toLocaleString()}/{MAX_CHARS.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats Bar */}
            {parts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 flex-wrap"
              >
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/15">
                  <Hash className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs text-cyan-400 font-medium">{parts.length} Parts</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/15">
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs text-purple-400 font-medium">{charCount.toLocaleString()} chars</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/15">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-amber-400 font-medium">~{Math.ceil(parts.length * 0.5)} min</span>
                </div>
              </motion.div>
            )}

            {/* Generate Button */}
            <motion.button
              onClick={startGeneration}
              disabled={parts.length === 0 || isRendering}
              className="w-full py-4 bg-gradient-to-r from-cyan-600 via-blue-600 to-purple-600 hover:from-cyan-500 hover:via-blue-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-white shadow-xl shadow-blue-900/30 transition-all active:scale-[0.98] flex items-center justify-center gap-3 relative overflow-hidden group"
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
              {isRendering ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Generating Audio...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  <Music className="w-4 h-4" />
                  Generate {parts.length > 0 ? `${parts.length} Audio Part${parts.length > 1 ? 's' : ''}` : 'Audio'}
                </>
              )}
            </motion.button>

            {/* Progress Tracker */}
            {workflowStatus !== 'idle' && (
              <ProgressPanel
                status={workflowStatus}
                message={statusMessage}
                startTime={startTime}
                totalParts={parts.length}
                doneParts={parts.filter(p => p.status === 'done').length}
                onRefresh={pollStatus}
                workflowRunId={workflowRunId}
                account={getActiveAccount()}
              />
            )}

            {/* Download Section */}
            {workflowStatus === 'completed' && downloadUrl && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 20 }}
                className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-emerald-500/5 p-5 space-y-4"
              >
                <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                  <CheckCircle2 className="w-5 h-5" /> Audio Ready!
                </div>
                <button onClick={handleDownload} disabled={isDownloading}
                  className="w-full relative rounded-xl overflow-hidden">
                  {isDownloading && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-cyan-600/30 to-blue-600/30"
                      initial={{ width: '0%' }} animate={{ width: `${downloadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                  <div className={`relative py-4 flex items-center justify-center gap-3 font-bold text-white transition-all ${isDownloading
                    ? 'bg-gradient-to-r from-cyan-700/50 to-blue-700/50'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-[0.98]'
                    }`}>
                    {isDownloading ? (
                      <>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
                          <DownloadCloud className="w-5 h-5" />
                        </motion.div>
                        Downloading... {downloadProgress}%
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" /> Download All Audio (ZIP)
                      </>
                    )}
                  </div>
                </button>
                {workflowRunId && (
                  <a
                    href={`https://github.com/${getActiveAccount()?.owner}/${getActiveAccount()?.repo}/actions/runs/${workflowRunId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-300 hover:text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" /> View Logs on GitHub
                  </a>
                )}
              </motion.div>
            )}

            {/* Failed */}
            {workflowStatus === 'failed' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-3">
                <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
                  <XCircle className="w-5 h-5" /> Generation Failed
                </div>
                <p className="text-xs text-slate-400">{statusMessage}</p>
                <div className="flex gap-3">
                  <button onClick={startGeneration}
                    className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Retry
                  </button>
                  {workflowRunId && (
                    <a href={`https://github.com/${getActiveAccount()?.owner}/${getActiveAccount()?.repo}/actions/runs/${workflowRunId}`}
                      target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-400 flex items-center gap-2">
                      View Logs
                    </a>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* ═══ RIGHT PANEL: Parts Preview ═══ */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-purple-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Text Parts
                {parts.length > 0 && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="ml-2 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  >
                    {parts.length}
                  </motion.span>
                )}
              </h2>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-180px)] overflow-y-auto rounded-2xl pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              <AnimatePresence mode="popLayout">
                {parts.length > 0 ? (
                  parts.map((part, idx) => (
                    <motion.div
                      key={part.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.02 }}
                      className={`bg-[#121214] border rounded-xl overflow-hidden group/part transition-all ${part.status === 'done' ? 'border-green-500/20' :
                        part.status === 'processing' ? 'border-cyan-500/30 shadow-lg shadow-cyan-500/5' :
                          part.status === 'failed' ? 'border-red-500/20' :
                            'border-white/5 hover:border-white/10'
                        }`}
                    >
                      {/* Part header */}
                      <div className="px-3 py-2 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${part.status === 'done' ? 'bg-green-500/10 text-green-400' :
                            part.status === 'processing' ? 'bg-cyan-500/10 text-cyan-400' :
                              part.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                                'bg-white/5 text-slate-500'
                            }`}>
                            {part.status === 'processing' && <Loader2 className="w-3 h-3 inline animate-spin mr-1" />}
                            {part.status === 'done' && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                            {part.status === 'failed' && <XCircle className="w-3 h-3 inline mr-1" />}
                            Part {part.id}
                          </span>
                          <span className="text-[9px] text-slate-600 font-mono">{part.charCount} chars</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/part:opacity-100 transition-opacity">
                          <button
                            onClick={() => copyPartText(part.text, part.id)}
                            className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-white transition-colors"
                          >
                            {copiedPart === part.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      {/* Part text */}
                      <div className="px-3 py-2.5 text-xs text-slate-400 leading-relaxed max-h-[100px] overflow-hidden relative">
                        {part.text}
                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#121214] to-transparent pointer-events-none" />
                      </div>
                      {/* Audio player (if done) */}
                      {part.status === 'done' && part.audioUrl && (
                        <div className="px-3 py-2 border-t border-white/5">
                          <AudioPlayer url={part.audioUrl} partNum={part.id} />
                        </div>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-600 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center border border-white/5">
                      <AlertCircle className="w-8 h-8 opacity-20" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-medium opacity-40">No Parts Yet</p>
                      <p className="text-xs max-w-[220px] leading-relaxed opacity-30">
                        Paste your script on the left and it will automatically split into parts
                      </p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-white/5 mt-6 relative z-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 opacity-20 hover:opacity-50 transition-opacity duration-500">
          <div className="text-xs">KUX TTS — Kyutai 1.6B Bulk Audio Generator</div>
          <div className="flex gap-4 text-[10px]">
            <span>GitHub Actions</span><span>•</span><span>Playwright</span><span>•</span><span>Kyutai TTS</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   PROGRESS PANEL
   ═══════════════════════════════════════════════════════════ */
const ProgressPanel: React.FC<{
  status: WorkflowStatus;
  message: string;
  startTime: number | null;
  totalParts: number;
  doneParts: number;
  onRefresh: () => void;
  workflowRunId: number | null;
  account: GitHubAccount | null;
}> = ({ status, message, startTime, totalParts, doneParts, onRefresh, workflowRunId, account }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime || status === 'completed' || status === 'failed' || status === 'idle') return;
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime, status]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent =
    status === 'completed' ? 100 :
      status === 'failed' ? 100 :
        totalParts > 0 ? Math.min(95, Math.round((doneParts / totalParts) * 100)) :
          status === 'in_progress' ? Math.min(90, Math.floor(elapsed / 3)) :
            status === 'queued' ? 5 : 0;

  const barColor =
    status === 'completed' ? 'from-green-500 to-emerald-400' :
      status === 'failed' ? 'from-red-500 to-orange-500' :
        'from-cyan-500 via-blue-500 to-purple-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden"
    >
      {/* Progress bar */}
      <div className="h-1.5 bg-white/5 relative overflow-hidden">
        <motion.div
          className={`h-full bg-gradient-to-r ${barColor}`}
          initial={{ width: '0%' }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        {(status === 'in_progress' || status === 'queued') && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {['triggering', 'queued', 'in_progress'].includes(status) && (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <Loader2 className="w-4 h-4 text-cyan-400" />
              </motion.div>
            )}
            {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
            <span className="text-sm font-medium text-white">{message}</span>
          </div>
          {['in_progress', 'queued'].includes(status) && (
            <button onClick={onRefresh} className="text-xs flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          )}
        </div>

        {startTime && (
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>Elapsed: <span className="text-white font-mono">{formatTime(elapsed)}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Music className="w-3 h-3" />
              <span>Parts: <span className="text-white font-mono">{doneParts}/{totalParts}</span></span>
            </div>
            {status === 'in_progress' && (
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-yellow-400" />
                <span className="text-yellow-400">Processing...</span>
              </div>
            )}
          </div>
        )}

        {workflowRunId && account && (
          <a
            href={`https://github.com/${account.owner}/${account.repo}/actions/runs/${workflowRunId}`}
            target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1"
          >
            <Eye className="w-3 h-3" /> Run #{workflowRunId}
          </a>
        )}
      </div>
    </motion.div>
  );
};

export default App;
