import { useState } from 'react';
import { deleteUser } from 'firebase/auth';
import { cn, shortcutLabel, isMac } from '../lib/utils';
import { Monitor, Keyboard, User, Trash2, AlertCircle, Settings, Database } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useAppStore } from '../stores/appStore';
import { useTheme } from '../hooks/useTheme';
import { useAuth, getAuthErrorMessage } from '../hooks/useAuth';
import { useToast } from './ui/Toast';
import { auth } from '../lib/firebase';
import { updateUserSettings, deleteAllUserData } from '../services/firebaseSync';
import { ExportImportModal } from './ExportImport';

export function SettingsModal() {
  const user = useAppStore((state) => state.user);
  const shortcutsEnabled = useAppStore((state) => state.shortcutsEnabled);
  const setShortcutsEnabled = useAppStore((state) => state.setShortcutsEnabled);
  const showSettings = useAppStore((state) => state.showSettings);
  const setShowSettings = useAppStore((state) => state.setShowSettings);
  const setShowExportImport = useAppStore((state) => state.setShowExportImport);
  const { theme, setThemeMode } = useTheme();
  const { signOut, resetPassword } = useAuth();
  const { showToast } = useToast();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleShortcuts = () => {
    const enabled = !shortcutsEnabled;
    setShortcutsEnabled(enabled);
    updateUserSettings({ shortcutsEnabled: enabled }).catch((error) => console.error('Failed to save setting:', error));
  };

  const handleSignOut = async () => {
    window.dispatchEvent(new CustomEvent('quicknotes:save'));
    setShowSettings(false);
    await signOut();
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    try {
      await resetPassword(user.email);
      showToast('success', 'Password reset email sent!');
    } catch (error) {
      showToast('error', getAuthErrorMessage(error));
    }
  };

  const closeDeleteAccount = () => {
    setShowDeleteAccount(false);
    setDeleteConfirmText('');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE' || !auth.currentUser) return;
    setIsDeleting(true);
    try {
      await deleteAllUserData();
      try {
        await deleteUser(auth.currentUser);
        showToast('success', 'Your account and all data have been deleted.');
      } catch (error) {
        // Firebase requires a recent sign-in to delete the auth account itself
        if ((error as { code?: string }).code === 'auth/requires-recent-login') {
          showToast('info', 'All data deleted. Sign in again and repeat to delete the account itself.', 8000);
          await signOut();
        } else {
          throw error;
        }
      }
      closeDeleteAccount();
      setShowSettings(false);
    } catch (error) {
      console.error('Failed to delete account:', error);
      showToast('error', 'Failed to delete account: ' + getAuthErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ExportImportModal />

      <Modal isOpen={showSettings} onClose={() => setShowSettings(false)} title="Settings" size="lg">
        <div className="space-y-8">
          {/* Appearance */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Appearance
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
              {(['light', 'dark', 'system'] as const).map((mode) => (
                <label
                  key={mode}
                  className={cn(
                    'flex flex-col gap-1 cursor-pointer p-3 rounded-lg border transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                    theme === mode ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={mode}
                    checked={theme === mode}
                    onChange={() => setThemeMode(mode)}
                    className="sr-only"
                  />
                  <span className="font-medium text-foreground capitalize">{mode}</span>
                  <span className="text-xs text-muted-foreground">
                    {mode === 'light' && 'Always light'}
                    {mode === 'dark' && 'Always dark'}
                    {mode === 'system' && 'Match your device'}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Editor */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              Editor
            </h3>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-4 cursor-pointer p-3 rounded-lg border border-border transition-colors hover:bg-muted/50">
                <div>
                  <div className="font-medium text-foreground">Keyboard Shortcuts</div>
                  <div className="text-sm text-muted-foreground">
                    {isMac ? '⌥N' : 'Alt+N'} new note, {shortcutLabel('k')} search, {shortcutLabel('s')} save, ↑/↓ navigate
                  </div>
                </div>
                <span className="ds-toggle">
                  <input
                    type="checkbox"
                    className="ds-toggle-input"
                    checked={shortcutsEnabled}
                    onChange={handleToggleShortcuts}
                  />
                  <span className="ds-toggle-track">
                    <span className="ds-toggle-thumb" />
                  </span>
                </span>
              </label>

              <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border">
                <div>
                  <div className="font-medium text-foreground">Auto-save</div>
                  <div className="text-sm text-muted-foreground">Changes are saved automatically as you type</div>
                </div>
                <span className="badge badge-primary whitespace-nowrap">1.5s delay</span>
              </div>
            </div>
          </section>

          {/* Data */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Data
            </h3>
            <Button variant="ghost" className="border border-border" onClick={() => { setShowSettings(false); setShowExportImport(true); }}>
              Export / Import Notes
            </Button>
          </section>

          {/* Account */}
          {user && (
            <section>
              <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                <User className="w-5 h-5" />
                Account
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                    {(user.displayName?.[0] || user.email[0] || '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{user.displayName || 'No name'}</div>
                    <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" className="border border-border" onClick={handleResetPassword}>
                    Reset Password
                  </Button>
                  <Button variant="ghost" size="sm" className="border border-border" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* Danger Zone */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Danger Zone
            </h3>
            <div className="space-y-2">
              <Button variant="destructive" onClick={() => setShowDeleteAccount(true)}>
                <Trash2 className="w-4 h-4" />
                Delete All Data & Account
              </Button>
              <p className="text-sm text-muted-foreground">
                Permanently deletes all your notes, folders and your account. This cannot be undone.
              </p>
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="ghost" onClick={() => setShowSettings(false)}>Close</Button>
        </div>
      </Modal>

      {/* Delete Account Confirmation */}
      <Modal isOpen={showDeleteAccount} onClose={closeDeleteAccount} title="Delete Account" size="sm">
        <div className="space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <div className="text-center">
            <h4 className="font-medium text-foreground mb-2">This action is irreversible</h4>
            <p className="text-sm text-muted-foreground mb-4">
              All your notes, folders, and account data will be permanently deleted.
            </p>
            <label htmlFor="delete-confirm" className="block text-sm text-foreground mb-2">Type "DELETE" to confirm:</label>
            <input
              id="delete-confirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="input text-center"
              placeholder="DELETE"
              maxLength={6}
              autoComplete="off"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={closeDeleteAccount} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE'}
              loading={isDeleting}
              className="flex-1"
            >
              Delete Account
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function SettingsButton({ collapsed = false }: { collapsed?: boolean }) {
  const setShowSettings = useAppStore((state) => state.setShowSettings);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShowSettings(true)}
      className={cn('w-full', collapsed ? 'justify-center px-0' : 'justify-start')}
      aria-label="Settings"
      title="Settings"
    >
      <Settings className="w-4 h-4" />
      {!collapsed && 'Settings'}
    </Button>
  );
}
