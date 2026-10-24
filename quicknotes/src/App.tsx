import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { SettingsModal } from './components/Settings';
import { Button } from './components/ui/Button';
import { ConfirmDialog } from './components/ui/Modal';
import { ToastProvider } from './components/ui/Toast';
import { useAuth, useAuthListener, getAuthErrorMessage } from './hooks/useAuth';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { useAppStore } from './stores/appStore';
import { processSyncQueue, createNewNote, deleteNote } from './services/firebaseSync';
import { isMac } from './lib/utils';

export function App() {
  useAuthListener();
  useTheme();
  useKeyboardShortcuts();

  const { loading, isAuthenticated } = useAuth();

  // Retry queued writes when coming back online
  useEffect(() => {
    if (!isAuthenticated) return;
    processSyncQueue();
    const handleOnline = () => processSyncQueue();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isAuthenticated]);

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
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="h-dvh flex bg-background overflow-hidden">
        <Sidebar />
        <main id="main-content" className="flex-1 flex overflow-hidden min-w-0">
          <NoteList />
          <NoteEditor />
        </main>
        <SettingsModal />
        <DeleteNoteDialog />
      </div>
      <NewNoteButton />
    </ToastProvider>
  );
}

function NewNoteButton() {
  const hasFolders = useAppStore((state) => state.folders.length > 0);
  if (!hasFolders) return null;

  return (
    <button
      onClick={() => createNewNote()}
      aria-label="Create new note"
      title={`New note (${isMac ? '⌥N' : 'Alt+N'})`}
      className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Plus className="w-7 h-7" />
    </button>
  );
}

function DeleteNoteDialog() {
  const showDeleteConfirm = useAppStore((state) => state.showDeleteConfirm);
  const setShowDeleteConfirm = useAppStore((state) => state.setShowDeleteConfirm);
  const isOpen = showDeleteConfirm.type === 'note' && !!showDeleteConfirm.id;
  const close = () => setShowDeleteConfirm('note', null);

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={close}
      onConfirm={async () => {
        const id = showDeleteConfirm.id;
        close();
        if (id) await deleteNote(id);
      }}
      title="Delete Note"
      message="This note will be permanently deleted. This cannot be undone."
      confirmText="Delete"
      variant="destructive"
    />
  );
}

function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const switchMode = (next: typeof mode) => {
    setMode(next);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        await signUp(email, password, displayName.trim() || undefined);
      } else {
        await resetPassword(email);
        setSuccess('Password reset email sent! Check your inbox.');
        setMode('signin');
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div id="main-content" className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-bold text-foreground text-display">QuickNotes</h1>
          <p className="text-muted-foreground mt-2">Dump thoughts. Organize fast. Sync everywhere.</p>
        </div>

        <div className="card p-6">
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
            {mode === 'signup' && (
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
                  autoComplete="name"
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

            {mode !== 'forgot' && (
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
            )}

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
                  minLength={6}
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
                <p>Don't have an account? <button type="button" onClick={() => switchMode('signup')} className="text-primary font-medium hover:underline">Sign up</button></p>
                <p className="mt-2"><button type="button" onClick={() => switchMode('forgot')} className="text-primary font-medium hover:underline">Forgot password?</button></p>
              </>
            )}
            {mode === 'signup' && (
              <p>Already have an account? <button type="button" onClick={() => switchMode('signin')} className="text-primary font-medium hover:underline">Sign in</button></p>
            )}
            {mode === 'forgot' && (
              <p>Remember your password? <button type="button" onClick={() => switchMode('signin')} className="text-primary font-medium hover:underline">Sign in</button></p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
