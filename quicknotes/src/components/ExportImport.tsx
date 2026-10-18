import { useState } from 'react';
import { Download, Upload, FileText, Archive, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useAppStore } from '../stores/appStore';
import { useToast } from './ui/Toast';
import { exportAllData, importData } from '../services/firebaseSync';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export function ExportImportModal() {
  const { showInstallPrompt, setShowInstallPrompt } = useAppStore();
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [exportFormat, setExportFormat] = useState<'json' | 'zip'>('zip');
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importOptions, setImportOptions] = useState({ mergeStrategy: 'merge' as 'replace' | 'merge' | 'skip' });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const json = await exportAllData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      
      if (exportFormat === 'json') {
        // Export as single JSON file
        const blob = new Blob([json], { type: 'application/json' });
        saveAs(blob, `quicknotes-export-${timestamp}.json`);
      } else {
        // Export as ZIP with JSON + Markdown files
        const zip = new JSZip();
        const data = JSON.parse(json);
        
        // Add notes.json
        zip.file('notes.json', JSON.stringify(data.notes, null, 2));
        
        // Add folders.json
        zip.file('folders.json', JSON.stringify(data.folders, null, 2));
        
        // Add metadata
        zip.file('metadata.json', JSON.stringify({
          version: data.version,
          exportedAt: data.exportedAt,
          user: data.user,
        }, null, 2));
        
        // Add markdown files
        const foldersFolder = zip.folder('folders');
        if (foldersFolder) {
          for (const folder of data.folders) {
            if (folder.isInbox || folder.isArchive) continue;
            const folderNotes = data.notes.filter((n: any) => n.folderId === folder.id);
            for (const note of folderNotes) {
              const frontmatter = {
                title: note.title,
                createdAt: new Date(note.createdAt).toISOString(),
                updatedAt: new Date(note.updatedAt).toISOString(),
                pinned: note.pinned,
                tags: note.tags || [],
              };
              const mdContent = `---\n${Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n${note.content}`;
              const safeName = note.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50) || 'untitled';
              foldersFolder.file(`${folder.name}/${safeName}-${note.id}.md`, mdContent);
            }
          }
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `quicknotes-export-${timestamp}.zip`);
      }
      showToast('success', 'Export completed successfully');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('error', 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setShowImportConfirm(true);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    
    setIsImporting(true);
    setImportProgress('Reading file...');
    
    try {
      const text = await importFile.text();
      setImportProgress('Importing data...');
      await importData(text, importOptions);
      showToast('success', 'Import completed successfully');
      setShowImportConfirm(false);
      setImportFile(null);
    } catch (error) {
      console.error('Import failed:', error);
      showToast('error', 'Import failed. Please check the file format.');
    } finally {
      setIsImporting(false);
      setImportProgress('');
    }
  };

  return (
    <>
      <Modal
        isOpen={showInstallPrompt}
        onClose={() => setShowInstallPrompt(false)}
        title="Export / Import Data"
        size="md"
      >
        <div className="space-y-6">
          {/* Export Section */}
          <div className="border-b border-border pb-6">
            <h3 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export Notes
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Export all your notes and folders as a backup file.
            </p>
            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportFormat"
                  value="zip"
                  checked={exportFormat === 'zip'}
                  onChange={() => setExportFormat('zip')}
                  className="sr-only peer"
                />
                <div className={cn(
                  'px-4 py-2 rounded-lg border transition-colors cursor-pointer',
                  exportFormat === 'zip'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                )}>
                  <div className="flex items-center gap-2">
                    <Archive className="w-5 h-5" />
                    <span>ZIP (JSON + Markdown)</span>
                  </div>
                  <p className="text-xs opacity-75 mt-1">Best for backups & migration</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportFormat"
                  value="json"
                  checked={exportFormat === 'json'}
                  onChange={() => setExportFormat('json')}
                  className="sr-only peer"
                />
                <div className={cn(
                  'px-4 py-2 rounded-lg border transition-colors cursor-pointer',
                  exportFormat === 'json'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                )}>
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    <span>JSON Only</span>
                  </div>
                  <p className="text-xs opacity-75 mt-1">Single file, simpler format</p>
                </div>
              </label>
            </div>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full"
            >
              {isExporting ? 'Exporting...' : 'Export Data'}
            </Button>
          </div>

          {/* Import Section */}
          <div>
            <h3 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Import Notes
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Import notes from a previous export. Supports JSON and ZIP formats.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                Merge Strategy
              </label>
              <div className="space-y-2">
                {(['merge', 'replace', 'skip'] as const).map((strategy) => (
                  <label key={strategy} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="mergeStrategy"
                      value={strategy}
                      checked={importOptions.mergeStrategy === strategy}
                      onChange={() => setImportOptions({ ...importOptions, mergeStrategy: strategy })}
                      className="sr-only peer"
                    />
                    <div className={cn(
                      'flex-1 p-3 rounded-lg border transition-colors',
                      importOptions.mergeStrategy === strategy
                        ? 'bg-primary/5 border-primary'
                        : 'border-border hover:bg-muted/50'
                    )}>
                      <div className="font-medium text-foreground capitalize">{strategy}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {strategy === 'merge' && 'Add new, update existing (by ID)'}
                        {strategy === 'replace' && 'Delete all current data, use import only'}
                        {strategy === 'skip' && 'Only add new, never update existing'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <input
              type="file"
              id="importFile"
              accept=".json,.zip"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isImporting}
            />
            <Button
              variant="ghost"
              onClick={() => document.getElementById('importFile')?.click()}
              disabled={isImporting}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose File to Import
            </Button>

            {importProgress && (
              <p className={cn(
                'text-sm text-center mt-2',
                importProgress.includes('failed') ? 'text-destructive' : 'text-primary'
              )}>
                {importProgress}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Import Confirmation Dialog */}
      <Modal
        isOpen={showImportConfirm}
        onClose={() => { setShowImportConfirm(false); setImportFile(null); }}
        title="Confirm Import"
        size="sm"
      >
        <div className="space-y-4">
          <AlertCircle className="w-12 h-12 text-accent mx-auto" />
          <div className="text-center">
            <h4 className="font-medium text-foreground mb-2">Import {importFile?.name}</h4>
            <p className="text-sm text-muted-foreground">
              This will {importOptions.mergeStrategy === 'replace' ? 'replace all your current notes' : 'merge with your existing notes'}.
              This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => { setShowImportConfirm(false); setImportFile(null); }} className="flex-1">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleImport} disabled={isImporting} className="flex-1">
              {isImporting ? 'Importing...' : 'Confirm Import'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}