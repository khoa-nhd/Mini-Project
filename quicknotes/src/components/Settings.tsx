import { useState } from 'react';
import { cn } from '../lib/utils';
import { Moon, Sun, Monitor, Keyboard, Save, User, Bell, Trash2, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useAppStore } from '../stores/appStore';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './ui/Toast';
import { updateUserSettings, cleanupOnLogout, exportAllData } from '../services/firebaseSync';
import { ExportImportModal } from './ExportImport';

export function SettingsModal() {
  const { user, updateUserSettings: updateSettingsStore, shortcutsEnabled, setShortcutsEnabled, showSettings, setShowSettings } = useAppStore();
  const { theme, resolvedTheme, setThemeMode, toggleTheme } = useTheme();
  const { signOut, resetPassword } = useAuth();
  const { showToast } = useToast();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setShowSettings(false);
  };

  const handleResetPassword = async () => {
    if (user?.email) {
      await resetPassword(user.email);
      showToast('success', 'Password reset email sent!');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setIsDeleting(true);
    try {
      await cleanupOnLogout();
      // Note: Actual Firebase Auth account deletion would require re-authentication
      // This is handled by the user in Firebase Console or via a Cloud Function
      showToast('info', 'Account data cleared. To permanently delete your account, go to Firebase Console.');
    } catch (error) {
      console.error('Failed to delete account:', error);
      showToast('error', 'Failed to delete account');
    } finally {
      setIsDeleting(false);
      setShowDeleteAccount(false);
      setDeleteConfirmText('');
    }
  };

  return (
    <>
      <ExportImportModal />
      
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Settings"
        size="lg"
      >
        <div className="space-y-8 max-h-[70vh] overflow-y-auto">
          {/* Appearance */}
          <section>
            <h3 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Appearance
            </h3>
            <div className="space-y-3">
              {(['light', 'dark', 'system'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border transition-colors hover:bg-muted/50">
                  <input
                    type="radio"
                    name="theme"
                    value={mode}
                    checked={theme === mode}
                    onChange={() => setThemeMode(mode)}
                    className="sr-only peer"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-foreground capitalize">{mode}</div>
                    <div className="text-sm text-muted-foreground">
                      {mode === 'light' && 'Always use light mode'}
                      {mode === 'dark' && 'Always use dark mode'}
                      {mode === 'system' && 'Match system preference'}
                    </div>
                  </div>
                  <div className={cn(
                    'w-10 h-6 rounded-full relative transition-colors',
                    theme === mode ? 'bg-primary' : 'bg-muted'
                  )}>
                    <div className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                      theme === mode ? 'translate-x-5' : 'translate-x-0'
                    )} />
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Editor */}
          <section>
            <h3 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              Editor
            </h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer p-3 rounded-lg border transition-colors hover:bg-muted/50">
                <div>
                  <div className="font-medium text-foreground">Keyboard Shortcuts</div>
                  <div className="text-sm text-muted-foreground">Enable {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+N, {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+K, {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+S, etc.</div>
                </div>
                <label className="ds-toggle">
                  <input
                    type="checkbox"
                    className="ds-toggle-input"
                    checked={shortcutsEnabled}
                    onChange={() => setShortcutsEnabled(!shortcutsEnabled)}
                    aria-checked={shortcutsEnabled}
                  />
                  <span className="ds-toggle-track">
                    <span className="ds-toggle-thumb" />
                  </span>
                </label>
              </label>

              <label className="flex items-center justify-between cursor-pointer p-3 rounded-lg border transition-colors hover:bg-muted/50">
                <div>
                  <div className="font-medium text-foreground">Auto-save</div>
                  <div className="text-sm text-muted-foreground">Automatically save changes as you type</div>
                </div>
                <span className="badge badge-primary">Enabled (1.5s delay)</span>
              </label>
            </div>
          </section>

          {/* Account */}
          {user && (
            <section>
              <h3 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Account
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                    {user.displayName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{user.displayName || 'No name'}</div>
                    <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={handleResetPassword}>
                    Reset Password
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* Danger Zone */}
          <section>
            <h3 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Danger Zone
            </h3>
            <div className="space-y-3">
              <Button 
                variant="destructive" 
                onClick={() => setShowDeleteAccount(true)}
                className="w-full justify-start"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete All Data & Account
              </Button>
              <p className="text-sm text-muted-foreground">
                This will permanently delete all your notes, folders, and account data. This cannot be undone.
              </p>
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="ghost" onClick={() => setShowSettings(false)}>Close</Button>
        </div>
      </Modal>

      {/* Delete Account Confirmation */}
      <Modal
        isOpen={showDeleteAccount}
        onClose={() => { setShowDeleteAccount(false); setDeleteConfirmText(''); }}
        title="Delete Account"
        size="sm"
      >
        <div className="space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <div className="text-center">
            <h4 className="font-medium text-foreground mb-2">This action is irreversible</h4>
            <p className="text-sm text-muted-foreground mb-4">
              All your notes, folders, and account data will be permanently deleted.
            </p>
            <p className="text-sm text-foreground mb-2">Type "DELETE" to confirm:</p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="input text-center"
              placeholder="DELETE"
              maxLength={6}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => { setShowDeleteAccount(false); setDeleteConfirmText(''); }} className="flex-1">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'DELETE' || isDeleting} className="flex-1">
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function SettingsButton() {
  const { showSettings, setShowSettings } = useAppStore();
  
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShowSettings(true)}
      className="w-full justify-start"
    >
      <Settings className="w-4 h-4 mr-2" />
      Settings
    </Button>
  );
}

// Need to import Settings icon
import { Settings } from 'lucide-react';