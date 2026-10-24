import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { SettingsModal } from './components/Settings';
import { Button } from './components/ui/Button';
import { ToastProvider } from './components/ui/Toast';
import { useAuth } from './hooks/useAuth';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { useAppStore } from './stores/appStore';
import { startRealtimeSync, stopRealtimeSync, processSyncQueue } from './services/firebaseSync';

export function App() {
  const { user, loading, isAuthenticated } = useAuth();
  const { theme, resolvedTheme } = useTheme();
  const { setShowInstallPrompt } = useAppStore();

  useKeyboardShortcuts();

  // Initialize real-time sync when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      startRealtimeSync();
      
      // Process sync queue when coming online
      const handleOnline = () => processSyncQueue();
      window.addEventListener('online', handleOnline);
      
      return () => {
        stopRealtimeSync();
        window.removeEventListener('online', handleOnline);
      };
    }
  }, [isAuthenticated]);

  // Handle PWA install prompt
  useEffect(() => {
    let deferredPrompt: BeforeInstallPromptEvent | null = null;
    let visitCount = parseInt(localStorage.getItem('quicknotes_visits') || '0', 10);
    visitCount++;
    localStorage.setItem('quicknotes_visits', String(visitCount));

    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      deferredPrompt = e;
      
      // Show prompt after 2 visits or 30 seconds
      if (visitCount >= 2) {
        setTimeout(() => {
          if (deferredPrompt) {
            setShowInstallPrompt(true);
          }
        }, 30000);
      }
    };

    const handleAppInstalled = () => {
      deferredPrompt = null;
      setShowInstallPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [setShowInstallPrompt]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading QuickNotes...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <ToastProvider>
      <div className="min-h-screen flex bg-background">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            <NoteList />
            <NoteEditor />
          </div>
        </div>
        <SettingsModal />
      </div>
      <button
        onClick={() => {
          const state = useAppStore.getState();
          const folderId = state.activeFolderId ?? state.folders[0]?.id;
          if (folderId) {
            const newNote = {
              id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              userId: '',
              folderId,
              title: '',
              content: '',
              order: 0,
              pinned: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              wordCount: 0,
              charCount: 0,
            };
            state.addNote(newNote);
            state.setSelectedNote(newNote.id);
            state.setCreatingNote(true);
          }
        }}
        aria-label="Create new note"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-24 h-24 rounded-full bg-teal-600 text-white shadow-2xl hover:scale-110 hover:bg-teal-700 active:scale-95 transition-all duration-200 ring-4 ring-background text-6xl leading-none"
        title="New note (Ctrl+N)"
      >
        +
      </button>
    </ToastProvider>
  );
}

function AuthPage() {
  const { signIn, signUp, resetPassword, resendVerification } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        await signUp(email, password, displayName);
        setSuccess('Account created! Please verify your email.');
        setMode('signin');
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setSuccess('Password reset email sent!');
        setMode('signin');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-bold text-foreground text-display">QuickNotes</h1>
          <p className="text-muted-foreground mt-2">Dump thoughts. Organize fast. Sync everywhere.</p>
        </div>

        <div id="main-content" className="card p-6">
          {success && (
            <div className="mb-4 alert alert-success" role="alert">
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 alert alert-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {(mode === 'signup') && (
              <div className="mb-4">
                <label htmlFor="displayName" className="block text-sm font-medium text-foreground mb-1">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input"
                  placeholder="Your name"
                  required={mode === 'signup'}
                />
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {mode === 'signup' && (
              <div className="mb-4">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              {mode === 'signin' && 'Sign In'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'forgot' && 'Send Reset Link'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'signin' && (
              <>
                <p>Don't have an account? <button onClick={() => setMode('signup')} className="btn btn-ghost text-sm px-0">Sign up</button></p>
                <p className="mt-2"><button onClick={() => setMode('forgot')} className="btn btn-ghost text-sm px-0">Forgot password?</button></p>
              </>
            )}
            {mode === 'signup' && (
              <p>Already have an account? <button onClick={() => setMode('signin')} className="btn btn-ghost text-sm px-0">Sign in</button></p>
            )}
            {mode === 'forgot' && (
              <p>Remember your password? <button onClick={() => setMode('signin')} className="btn btn-ghost text-sm px-0">Sign in</button></p>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';

// Type for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}