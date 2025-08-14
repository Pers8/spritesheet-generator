import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  FolderPlus,
  Plus,
  Trash2,
  Edit,
  Undo2,
  GripVertical,
  History,
  Terminal,
  Copy,
  Minimize2,
  Maximize2,
  X,
  Image,
  Play,
  Settings,
  PlayCircle,
  PauseCircle,
  RotateCcw,
  ChevronDown,
  Code,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import logoSrc from '@/assets/logo.png';
import path from 'path';

// Destructure exposed API from preload.js
const {
  loadSession,
  saveSession,
  openFolder,
  exportGif,
  exportPng,
  resetApp,
  onExportProgress,
  removeExportProgress,
  onResizeWarning,
  removeResizeWarning,
} = window.electronAPI;

const reorderFrames = (frames, startIndex, endIndex) => {
  const result = Array.from(frames);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

const reorderTabs = (tabs, startIndex, endIndex) => {
  const result = Array.from(tabs);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

const reorderFramesSmart = (frames, draggedIndex, targetIndex) => {
  const updatedFrames = [...frames];
  const [draggedFrame] = updatedFrames.splice(draggedIndex, 1);
  updatedFrames.splice(targetIndex, 0, draggedFrame);

  // Recalculate row and column positions
  return updatedFrames.map((frame, index) => ({
    ...frame,
    row: Math.floor(index / 6),
    column: index % 6,
  }));
};

export default function App() {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [lastOpenedTabId, setLastOpenedTabId] = useState(null); // Track last opened tab
  const [editingTabId, setEditingTabId] = useState(null);
  const [editTabName, setEditTabName] = useState('');
  const [undoStack, setUndoStack] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [showHistory, setShowHistory] = useState(false); // State to toggle history visibility
  const [historyFilterDate, setHistoryFilterDate] = useState(null); // Date filter for history
  const [showOutput, setShowOutput] = useState(false); // State to toggle output visibility
  const [outputLogs, setOutputLogs] = useState([]); // Logs for the output section
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false); // Collapsible output
  const [previewSection, setPreviewSection] = useState('frames'); // 'frames', 'animation', 'settings', 'code'
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(false); // Animation play/pause state
  const [gridSize, setGridSize] = useState('Auto'); // Grid size for settings
  const [fps, setFps] = useState(30); // FPS for GIF export
  const animationRef = useRef(null); // Ref for animation canvas

  const [exportHistory, setExportHistory] = useState([]); // Persisted export history
  const [showHistoryPanel, setShowHistoryPanel] = useState(true); // History panel visibility
  const [showOutputPanel, setShowOutputPanel] = useState(true); // Output panel visibility
  const [showAllFrames, setShowAllFrames] = useState(false); // State to toggle frame visibility
  const [uploadCode, setUploadCode] = useState(''); // State for generated upload code
  const [copyNotif, setCopyNotif] = useState(''); // State for copy notification
  const [lookupCount, setLookupCount] = useState(0);
  const [lookupCreatorId, setLookupCreatorId] = useState('');
  const [generatedIdsCode, setGeneratedIdsCode] = useState('');
  const [showCodeSection, setShowCodeSection] = useState(false); // State to toggle code section visibility
  const [roblosecurity, setRoblosecurity] = useState(''); // State for .ROBLOSECURITY cookie
  const [notifMessage, setNotifMessage] = useState(''); // Notification message
  const [showNotif, setShowNotif] = useState(false); // Notification visibility

  const fileInputRef = useRef();
  const nextTabIdRef = useRef(1);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const saveSessionsToStore = (tabsData = tabs) => {
    const dataToSave = tabsData.map(({ id, name, frames, history }) => ({
      id,
      name,
      frames,
      history,
    }));
    saveSession(dataToSave);
  };

  const addOutputLog = (message, type = 'info') => {
    setOutputLogs((logs) => [
      ...logs,
      { message, type, time: new Date() },
    ]);
  };

  const clearOutputLogs = () => {
    setOutputLogs([]);
    showNotification('Output logs cleared!');
  };

  const copyOutputLogs = () => {
    const logsText = outputLogs
      .map((log) => `[${log.time.toLocaleTimeString()}] ${log.message}`)
      .join('\n');
    navigator.clipboard.writeText(logsText);
    showNotification('Output logs copied to clipboard!');
  };

  const filterHistoryByDate = (history, filterDate) => {
    if (!filterDate) return history;
    return history.filter((entry) => {
      const entryDate = new Date(entry.time);
      return (
        entryDate.toDateString() === new Date(filterDate).toDateString() ||
        entryDate > new Date(filterDate)
      );
    });
  };

  const showNotification = (message) => {
    setNotifMessage(message);
    setShowNotif(true);
    setTimeout(() => setShowNotif(false), 3000);
  };

  const copyGeneratedCode = () => {
    navigator.clipboard.writeText(generatedIdsCode);
    showNotification('Code copied to clipboard!');
  };

  // ─── Load Persisted State on Mount ──────────────────────────────────────────
  useEffect(() => {
    const savedHistory = localStorage.getItem('exportHistory');
    if (savedHistory) setExportHistory(JSON.parse(savedHistory));

    const savedShowHistory = localStorage.getItem('showHistoryPanel');
    if (savedShowHistory !== null) setShowHistoryPanel(savedShowHistory === 'true');

    const savedShowOutput = localStorage.getItem('showOutputPanel');
    if (savedShowOutput !== null) setShowOutputPanel(savedShowOutput === 'true');

    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      const { fps: savedFps, gridSize: savedGridSize } = JSON.parse(savedSettings);
      if (savedFps) setFps(savedFps);
      if (savedGridSize) setGridSize(savedGridSize);
    }
  }, []);

  // ─── Save State on Changes ──────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('exportHistory', JSON.stringify(exportHistory));
  }, [exportHistory]);

  useEffect(() => {
    localStorage.setItem('showHistoryPanel', showHistoryPanel.toString());
  }, [showHistoryPanel]);

  useEffect(() => {
    localStorage.setItem('showOutputPanel', showOutputPanel.toString());
  }, [showOutputPanel]);

  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify({ fps, gridSize }));
  }, [fps, gridSize]);

  // ─── Load Sessions on Mount ─────────────────────────────────────────────────
  useEffect(() => {
    loadSession().then(data => {
      if (data && data.length) {
        const restored = data.map(tab => ({
          ...tab,
          isExporting: false,
          progress: 0,
          alert: null,
          frames: tab.frames.map(frame => ({
            ...frame,
            preview: /^[A-Za-z]:\\/.test(frame.path)
              ? 'file:///' + frame.path.replace(/\\/g, '/')
              : 'file://' + frame.path,
          })),
        }));
        setTabs(restored);
        setActiveTabId(restored[0].id);
        nextTabIdRef.current = Math.max(...restored.map(t => t.id)) + 1;
      } else {
        // no saved data → new default tab
        const initial = {
          id: 1,
          name: 'Session 1',
          frames: [],
          history: [],
          isExporting: false,
          progress: 0,
          alert: null,
        };
        setTabs([initial]);
        setActiveTabId(1);
        nextTabIdRef.current = 2;
        saveSession([{ id: 1, name: 'Session 1', frames: [], history: [] }]);
      }

      window.electronAPI.loadAppState().then(appState => {
        if (appState) {
          setShowOutput(appState.showOutput || false);
          setShowHistory(appState.showHistory || false);
          setHistoryFilterDate(appState.historyFilterDate || null);
          setOutputLogs(appState.outputLogs || []);
        }
      });
    });

    const prevent = e => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);

    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  useEffect(() => {
    const progressHandler = (_e, { tabId, progress }) => {
      setTabs((ts) =>
        ts.map((t) =>
          t.id === tabId ? { ...t, progress } : t
        )
      );
    };

    const resizeWarningHandler = (_e, { tabId }) => {
      setTabs((ts) =>
        ts.map((t) =>
          t.id === tabId
            ? {
                ...t,
                alert: {
                  type: 'info',
                  message: 'Frames were resized to fit within 1024×1024.',
                },
              }
            : t
        )
      );
      setTimeout(() => clearAlert(tabId), 5000);
    };

    onExportProgress(progressHandler);
    onResizeWarning(resizeWarningHandler);

    return () => {
      removeExportProgress(progressHandler);
      removeResizeWarning(resizeWarningHandler);
    };
  }, []);

  useEffect(() => {
    window.addEventListener('click', closeContextMenu);
    return () => window.removeEventListener('click', closeContextMenu);
  }, []);

  useEffect(() => {
    const appState = { 
      showOutput, 
      showHistory, 
      historyFilterDate, 
      outputLogs 
    };
    window.electronAPI.saveAppState(appState);
  }, [showOutput, showHistory, historyFilterDate, outputLogs]);

  useEffect(() => {
    saveSessionsToStore();
  }, [tabs]);

  useEffect(() => {
    // Remove onRobloxUpload listener
  }, []);

  // ─── Tab Operations ─────────────────────────────────────────────────────────
  const addTab = () => {
    // remember where we came from
    setLastOpenedTabId(activeTabId);
    const id = nextTabIdRef.current++;
    const tab = {
      id,
      name: `Session ${id}`,
      frames: [],
      history: [],
      isExporting: false,
      progress: 0,
      alert: null,
    };
    const updated = [...tabs, tab];
    setTabs(updated);
    setActiveTabId(id);
    saveSessionsToStore(updated);
  };

  const removeTab = (id) => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;

    // Revoke blob URLs
    tabs[idx].frames.forEach((f) => {
      if (f.preview?.startsWith('blob:')) URL.revokeObjectURL(f.preview);
    });

    // Push to undo stack
    setUndoStack((us) => [...us, tabs[idx]]);

    const updated = tabs.filter((t) => t.id !== id);

    let nextActive = lastOpenedTabId;
    if (!updated.find((t) => t.id === nextActive)) {
      if (updated.length > 0) {
        nextActive =
          idx < updated.length
            ? updated[idx].id
            : updated[updated.length - 1].id;
      } else {
        // No tabs left at all → create a new one
        const newId = nextTabIdRef.current++;
        updated.push({
          id: newId,
          name: `Session ${newId}`,
          frames: [],
          history: [],
          isExporting: false,
          progress: 0,
          alert: null,
        });
        nextActive = newId;
      }
    }

    setTabs(updated);
    setActiveTabId(nextActive);
    setLastOpenedTabId(null);

    saveSessionsToStore(updated);
  };

  const undoRemove = () => {
    setUndoStack((us) => {
      if (!us.length) return us;
      const last = us[us.length - 1];

      const restoredFrames = last.frames.map((f) => ({
        ...f,
        preview: /^[A-Za-z]:\\/.test(f.path)
          ? 'file:///' + f.path.replace(/\\/g, '/')
          : 'file://' + f.path,
      }));

      const restoredTab = {
        ...last,
        frames: restoredFrames,
      };

      const updated = [...tabs, restoredTab];
      setTabs(updated);
      setLastOpenedTabId(activeTabId);
      setActiveTabId(restoredTab.id);
      saveSessionsToStore(updated);

      return us.slice(0, -1);
    });
  };

  const setActiveTab = (id) => {
    setLastOpenedTabId(activeTabId);
    setActiveTabId(id);
  };

  const startRenaming = (id, currentName) => {
    setEditingTabId(id);
    setEditTabName(currentName);
  };

  const commitRename = id => {
    const trimmed = editTabName.trim();
    if (!trimmed) {
      setEditingTabId(null);
      return;
    }
    const updated = tabs.map(t =>
      t.id === id ? { ...t, name: trimmed } : t
    );
    setTabs(updated);
    saveSessionsToStore(updated);
    setEditingTabId(null);
  };

  const handleContextMenu = (e, tab) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, tab });
  };

  const closeContextMenu = () => setContextMenu(null);

  const duplicateTab = async (tab) => {
    const newTab = {
      ...tab,
      id: nextTabIdRef.current++,
      name: `${tab.name} (Copy)`,
      frames: await Promise.all(tab.frames.map(async frame => ({
        ...frame,
        preview: frame.preview.startsWith('blob:')
          ? URL.createObjectURL(await fetch(frame.preview).then(res => res.blob()))
          : frame.preview,
      }))),
      history: [...tab.history],
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
    saveSessionsToStore([...tabs, newTab]);
  };

  const onTabDragEnd = (result) => {
    if (!result.destination) return;
    const reorderedTabs = reorderTabs(tabs, result.source.index, result.destination.index);
    setTabs(reorderedTabs);
    saveSessionsToStore(reorderedTabs);
  };

  // ─── Frame Handling ─────────────────────────────────────────────────────────
  const onFilesSelected = (tabId, fileList) => {
    const imgs = Array.from(fileList).filter(f => f.type.startsWith('image'));
    if (!imgs.length) return;
    const newFrames = imgs.map((f, index) => ({
      name: f.name,
      path: f.path,
      preview: URL.createObjectURL(f),
      frameNumber: index + 1,
    }));
    const updated = tabs.map(t =>
      t.id === tabId
        ? { ...t, frames: newFrames } // Replace all frames
        : t
    );
    setTabs(updated);
    saveSessionsToStore(updated);
  };

  const removeFrame = (tabId, idx) => {
    const updated = tabs.map(t => {
      if (t.id !== tabId) return t;
      const frames = [...t.frames];
      const [removed] = frames.splice(idx, 1);
      if (removed.preview?.startsWith('blob:')) URL.revokeObjectURL(removed.preview);
      return { ...t, frames: frames.map((f, i) => ({ ...f, frameNumber: i + 1 })) }; // Update frame numbers
    });
    setTabs(updated);
    saveSessionsToStore(updated);
  };

  const clearFrames = (tabId) => {
    const updated = tabs.map(t =>
      t.id === tabId ? { ...t, frames: [] } : t // Preserve history
    );
    setTabs(updated);
    saveSessionsToStore(updated);
  };

  const onDropFiles = async (tabId, event) => {
    event.preventDefault();
    const items = event.dataTransfer.items;
    const files = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry.isFile) {
          files.push(item.getAsFile());
        } else if (entry.isDirectory) {
          const folderFiles = await readFolderFiles(entry);
          files.push(...folderFiles);
        }
      }
    }

    const imgs = files.filter(f => f.type.startsWith('image'));
    if (!imgs.length) return;

    const newFrames = imgs.map((f, index) => ({
      name: f.name,
      path: f.path,
      preview: URL.createObjectURL(f),
      frameNumber: index + 1,
    }));

    const updated = tabs.map(t =>
      t.id === tabId
        ? { ...t, frames: [...t.frames, ...newFrames] }
        : t
    );
    setTabs(updated);
    saveSessionsToStore(updated);
  };

  const readFolderFiles = async (directoryEntry) => {
    const reader = directoryEntry.createReader();
    const entries = await new Promise((resolve) => reader.readEntries(resolve));
    const files = [];

    for (const entry of entries) {
      if (entry.isFile) {
        files.push(await new Promise((resolve) => entry.file(resolve)));
      } else if (entry.isDirectory) {
        const subFiles = await readFolderFiles(entry);
        files.push(...subFiles);
      }
    }

    return files;
  };

  const handleFrameDragEnd = (result) => {
    if (!result.destination) return;

    const sourceIdx = result.source.index;
    const destIdx = result.destination.index;

    // Reorder frames in the active tab
    setTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.id !== activeTabId) return tab;

        const newFrames = Array.from(tab.frames);
        const [moved] = newFrames.splice(sourceIdx, 1);
        newFrames.splice(destIdx, 0, moved);

        return { ...tab, frames: newFrames };
      })
    );
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const updatedFrames = Array.from(active.frames);
    const [movedFrame] = updatedFrames.splice(result.source.index, 1);
    updatedFrames.splice(result.destination.index, 0, movedFrame);

    setTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.id === activeTabId ? { ...tab, frames: updatedFrames } : tab
      )
    );
  };

  // ─── Export ─────────────────────────────────────────────────────────────────
  const doExportGif = (tab) => {
    if (!tab.frames.length) {
      addOutputLog('Warning: No frames to export as GIF.', 'warning');
      setTabs((ts) =>
        ts.map((t) =>
          t.id === tab.id
            ? { ...t, alert: { type: 'warning', message: 'No frames to export.' } }
            : t
        )
      );
      setTimeout(() => clearAlert(tab.id), 3000);
      return;
    }
    setTabs(ts =>
      ts.map(t => t.id === tab.id ? { ...t, isExporting: true, progress: 0, alert: null } : t)
    );
    exportGif(tab.id, tab.frames).then(res => {
      handleExportResult(tab.id, 'gif', res);
      if (!res.error && !res.canceled) {
        setTabs((ts) =>
          ts.map((t) =>
            t.id === tab.id
              ? { ...t, alert: { type: 'success', message: 'GIF export completed successfully.' } }
              : t
          )
        );
        setTimeout(() => clearAlert(tab.id), 5000);
      }
    });
  };

  const doExportSpritesheet = async (tab) => {
    if (!tab.frames.length) {
      addOutputLog("Warning: No frames to export as Spritesheet.", "warning");
      setTabs((ts) =>
        ts.map((t) =>
          t.id === tab.id
            ? { ...t, alert: { type: "warning", message: "No frames to export." } }
            : t
        )
      );
      setTimeout(() => clearAlert(tab.id), 3000);
      return;
    }

    const framePaths = tab.frames.map((frame) => frame.path);

    setTabs((ts) =>
      ts.map((t) =>
        t.id === tab.id ? { ...t, isExporting: true, progress: 0, alert: null } : t
      )
    );

    const result = await exportPng(tab.id, framePaths);

    setTabs((ts) =>
      ts.map((t) =>
        t.id === tab.id ? { ...t, isExporting: false, progress: 0 } : t
      )
    );

    if (result.canceled) {
      addOutputLog("Export canceled.", "warning");
      setTabs((ts) =>
        ts.map((t) =>
          t.id === tab.id
            ? { ...t, alert: { type: "warning", message: "Export canceled." } }
            : t
        )
      );
      setTimeout(() => clearAlert(tab.id), 3000);
      return;
    }

    if (result.error) {
      addOutputLog(`Error: ${result.error}`, "error");
      setTabs((ts) =>
        ts.map((t) =>
          t.id === tab.id
            ? { ...t, alert: { type: "error", message: `Export failed: ${result.error}` } }
            : t
        )
      );
      setTimeout(() => clearAlert(tab.id), 5000);
      return;
    }

    addOutputLog(`Exported ${result.numSheets} spritesheets to ${result.folderPath}`, "info");
    setTabs((ts) =>
      ts.map((t) =>
        t.id === tab.id
          ? {
              ...t,
              alert: { type: "success", message: `Exported ${result.numSheets} spritesheets.` },
            }
          : t
      )
    );
    setTimeout(() => clearAlert(tab.id), 5000);
  };

  const handleExportResult = (tabId, fmt, result) => {
    // stop spinner
    setTabs(ts =>
      ts.map(t => t.id === tabId ? { ...t, isExporting: false, progress: 0 } : t)
    );

    if (result.canceled) {
      setTabs(ts =>
        ts.map(t => t.id === tabId
          ? { ...t, alert: { type: 'warning', message: 'Export canceled.' } }
          : t
        )
      );
      setTimeout(() => clearAlert(tabId), 3000);
      return;
    }
    if (result.error) {
      setTabs(ts =>
        ts.map(t => t.id === tabId
          ? { ...t, alert: { type: 'error', message: `Export failed: ${result.error}` } }
          : t
        )
      );
      setTimeout(() => clearAlert(tabId), 5000);
      return;
    }
    if (result.filePath) {
      const fileName = result.filePath.split(/[/\\]/).pop();
      const label = fmt.toUpperCase();
      setTabs(ts =>
        ts.map(t => {
          if (t.id !== tabId) return t;
          const history = [...(t.history || []), { format: label, file: result.filePath, time: Date.now() }];
          return { ...t, history, alert: { type: 'success', message: `Exported ${label} → ${fileName}` } };
        })
      );
      addOutputLog(`Exported ${label} → ${fileName}`);
      setTimeout(() => clearAlert(tabId), 5000);
    }
  };

  const clearAlert = tabId => {
    setTabs(ts =>
      ts.map(t => t.id === tabId ? { ...t, alert: null } : t)
    );
  };

  // ─── Reset App ───────────────────────────────────────────────────────────────
  const doResetAll = () => {
    if (!window.confirm('This will clear all sessions and output logs. Continue?')) return;
    resetApp().then(() => {
      // revoke previews
      tabs.forEach(tab =>
        tab.frames.forEach(f => {
          if (f.preview?.startsWith('blob:')) URL.revokeObjectURL(f.preview);
        })
      );
      // one fresh tab
      const initial = {
        id: 1,
        name: 'Session 1',
        frames: [],
        history: [],
        isExporting: false,
        progress: 0,
        alert: null,
      };
      setTabs([initial]);
      setActiveTabId(1);
      nextTabIdRef.current = 2;
      clearOutputLogs();
      saveSession([{ id: 1, name: 'Session 1', frames: [], history: [] }]);
    });
  };

  const handleAnimationPlayPause = () => {
    setIsAnimationPlaying((prev) => !prev);
  };

  const handleAnimationRestart = () => {
    if (animationRef.current) {
      animationRef.current.currentTime = 0;
      setIsAnimationPlaying(true);
    }
  };

  const toggleHistoryPanel = () => setShowHistoryPanel((prev) => !prev);
  const toggleOutputPanel = () => setShowOutputPanel((prev) => !prev);

  // ─── Render ──────────────────────────────────────────────────────────────────
  const active = tabs.find(t => t.id === activeTabId);
  const filteredHistory = filterHistoryByDate(active?.history || [], historyFilterDate);

  return (
    <>
      {/* ─── Custom Header ────────────────────────────── */}
      <div
        className="fixed top-0 left-0 w-full z-20 bg-[#1E1F23]/80 backdrop-blur-md flex items-center justify-center h-12"
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* Logo + Title (no-select region) */}
        <div
          className="flex items-center gap-2 select-none"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <img src={logoSrc} alt="Logo" className="h-4 w-4" /> {/* Adjusted size */}
          <h1 className="text-lg font-semibold text-white">Spritesheet Generator</h1>
        </div>

        {/* Window Controls (no-drag region) */}
        <div
          className="absolute right-4 flex items-center space-x-3"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="p-1 bg-transparent hover:bg-white/10 rounded transition"
          >
            <Minimize2 size={16} className="text-white" />
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="p-1 bg-transparent hover:bg-white/10 rounded transition"
          >
            <Maximize2 size={16} className="text-white" />
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="p-1 bg-transparent hover:bg-red-600 rounded transition"
          >
            <X size={16} className="text-white" />
          </button>
        </div>
      </div>

      {/* ─── Scrollable Content ───────────────────────── */}
      <div className="mt-12 h-[calc(100vh-3rem)] overflow-auto px-6 py-8">
        {/* Tabs */}
        <DragDropContext onDragEnd={onTabDragEnd}>
          <Droppable droppableId="tabs" direction="horizontal">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="flex items-center mb-5 space-x-2 overflow-x-auto"
              >
                {tabs.map((tab, index) => (
                  <Draggable key={tab.id} draggableId={String(tab.id)} index={index}>
                    {(provided) => (
                      <motion.div
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        ref={provided.innerRef}
                        onContextMenu={(e) => handleContextMenu(e, tab)}
                        onClick={() => {
                          setLastOpenedTabId(activeTabId);
                          setActiveTabId(tab.id);
                        }}
                        className={`px-4 py-2 rounded-xl flex items-center gap-2 text-sm
                          border border-white/10 ${tab.id === activeTabId ? 'bg-white/10' : 'hover:bg-white/5'}`}
                      >
                        <GripVertical size={12} className="cursor-move opacity-50" />
                        {editingTabId === tab.id ? (
                          <input
                            autoFocus
                            value={editTabName}
                            onChange={(e) => setEditTabName(e.target.value)}
                            onBlur={() => commitRename(tab.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(tab.id);
                            }}
                            className="bg-transparent border-none outline-none text-white w-20"
                          />
                        ) : (
                          <span onDoubleClick={() => startRenaming(tab.id, tab.name)}>
                            {tab.name}
                          </span>
                        )}
                        <Edit size={14} className="cursor-pointer" onClick={() => startRenaming(tab.id, tab.name)} />
                        {tabs.length > 1 && (
                          <Trash2 size={14} className="cursor-pointer text-red-400" onClick={() => removeTab(tab.id)} />
                        )}
                      </motion.div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                <button onClick={addTab} className="p-2 rounded-lg bg-transparent hover:bg-white/10">
                  <Plus size={16} />
                </button>
                {!!undoStack.length && (
                  <button onClick={undoRemove} className="p-2 rounded-lg bg-transparent hover:bg-white/10">
                    <Undo2 size={16} />
                  </button>
                )}
                <button
                  onClick={doResetAll}
                  className="p-2 rounded-lg bg-transparent hover:bg-white/10"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => setShowHistory((prev) => !prev)}
                  className={`p-2 rounded-lg ${
                    showHistory ? 'bg-blue-600' : 'bg-transparent hover:bg-white/10'
                  }`}
                >
                  <History size={16} />
                </button>
                <button
                  onClick={() => setShowOutput((prev) => !prev)}
                  className={`p-2 rounded-lg ${
                    showOutput ? 'bg-blue-600' : 'bg-transparent hover:bg-white/10'
                  }`}
                >
                  <Terminal size={16} />
                </button>
                <button
                  onClick={() => setShowCodeSection((prev) => !prev)}
                  className={`p-2 rounded-lg ${
                    showCodeSection ? 'bg-blue-600' : 'bg-transparent hover:bg-white/10'
                  }`}
                >
                  <Code size={16} />
                </button>
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* Drag & Drop / Browse */}
        <motion.div
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('bg-blue-500/20');
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('bg-blue-500/20');
          }}
          onDrop={(e) => {
            e.currentTarget.classList.remove('bg-blue-500/20');
            onDropFiles(activeTabId, e);
          }}
          onClick={() => fileInputRef.current.click()}
          whileHover={{ scale: 1.02 }}
          className={`
            w-full h-48 rounded-2xl border-2 border-dashed
            flex flex-col items-center justify-center mb-4
            cursor-pointer transition-colors
            bg-white/5 hover:bg-white/10
            border-white/20 hover:border-white/30
            backdrop-blur-sm
          `}
        >
          <FolderPlus size={40} className="opacity-80 mb-2" />
          <p className="text-sm">Drag & drop files or folders, or click to browse</p>
        </motion.div>

        {/* Export & Options Container */}
        <div className="bg-[#1E1F23] rounded-lg p-4 shadow-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => doExportGif(active)}
              className={`px-4 py-2 rounded ${
                active?.frames.length > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 cursor-not-allowed'
              }`}
              disabled={active?.frames.length === 0}
            >
              Export GIF
            </button>
            <button
              onClick={() => doExportSpritesheet(active)}
              className={`px-4 py-2 rounded ${
                active?.frames.length > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 cursor-not-allowed'
              }`}
              disabled={active?.frames.length === 0}
            >
              Export Spritesheet
            </button>
            {active?.frames.length > 0 && (
              <button
                onClick={() => clearFrames(activeTabId)}
                className="px-4 py-2 bg-red-600 rounded hover:bg-red-700"
              >
                Clear Frames
              </button>
            )}
            {active?.isExporting && (
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-white/20 rounded overflow-hidden">
                  <div
                    className="h-full bg-[#646cff] transition-all"
                    style={{ width: `${active.progress}%` }}
                  />
                </div>
                <span className="text-sm">{active.progress}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Preview Section Container */}
        {active?.frames.length > 0 && (
          <div className="bg-[#1E1F23] rounded-lg p-4 shadow-md mb-6">
            {/* Section Tabs */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <button
                onClick={() => setPreviewSection('frames')}
                className={`p-2 rounded-lg ${
                  previewSection === 'frames' ? 'bg-blue-600' : 'bg-transparent hover:bg-white/10'
                } transition`}
              >
                <Image size={20} className="text-white" />
              </button>
              <button
                onClick={() => setPreviewSection('animation')}
                className={`p-2 rounded-lg ${
                  previewSection === 'animation' ? 'bg-blue-600' : 'bg-transparent hover:bg-white/10'
                } transition`}
              >
                <Play size={20} className="text-white" />
              </button>
              <button
                onClick={() => setPreviewSection('settings')}
                className={`p-2 rounded-lg ${
                  previewSection === 'settings' ? 'bg-blue-600' : 'bg-transparent hover:bg-white/10'
                } transition`}
              >
                <Settings size={20} className="text-white" />
              </button>
            </div>

            {/* Section Content */}
            {previewSection === 'frames' && (
              <div className="relative">
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="frameGrid" direction="horizontal">
                    {(provided) => (
                      <div
                        className="frames-container grid grid-cols-6 gap-2 mb-4"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                      >
                        {active.frames
                          .slice(0, showAllFrames ? active.frames.length : 12) // Show 12 frames or all frames
                          .map((frame, idx) => (
                            <Draggable key={frame.path + idx} draggableId={frame.path + idx} index={idx}>
                              {(prov) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  className="frame-thumb relative bg-white/5 rounded-lg overflow-hidden group shadow-lg hover:shadow-xl transition-transform transform hover:scale-105 border-2 border-dotted border-transparent hover:border-blue-500"
                                >
                                  {/* Remove Frame Button */}
                                  <button
                                    className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center text-xs bg-black/50 rounded-full p-1 z-10 hover:bg-red-600 transition"
                                    onClick={() => removeFrame(activeTabId, idx)}
                                  >
                                    ×
                                  </button>

                                  {/* Frame Image */}
                                  <img
                                    src={frame.preview}
                                    alt={frame.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover group-hover:opacity-80 transition"
                                  />

                                  {/* Frame Number */}
                                  <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-2 py-1 rounded">
                                    #{frame.frameNumber}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                {/* Gradient Overlay */}
                {!showAllFrames && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none transition-opacity duration-300 rounded-lg"
                    style={{
                      top: 'auto',
                      bottom: '61.5px',
                    }}
                  />
                )}

                {/* Load More / Load Less Button */}
                {active.frames.length > 12 && (
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => setShowAllFrames((prev) => !prev)}
                      className="flex items-center justify-center"
                    >
                      <ChevronDown
                        size={24}
                        className={`text-white transition-transform ${showAllFrames ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                )}
              </div>
            )}

            {previewSection === 'animation' && (
              <div className="flex flex-col items-center gap-6">
                {/* Animation Canvas */}
                <div className="relative w-full h-64 bg-[#2A2B2F] border border-white/10 rounded-lg flex items-center justify-center shadow-md">
                  <canvas ref={animationRef} className="w-full h-full" />
                  {!isAnimationPlaying && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                      <button
                        onClick={handleAnimationPlayPause}
                        className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md transition"
                      >
                        <PlayCircle size={48} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Animation Controls */}
                <div className="flex flex-col md:flex-row items-center gap-6 w-full">
                  {/* Play/Pause and Restart */}
                  <div className="flex gap-4">
                    <button
                      onClick={handleAnimationPlayPause}
                      className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md transition"
                    >
                      {isAnimationPlaying ? <PauseCircle size={32} /> : <PlayCircle size={32} />}
                    </button>
                    <button
                      onClick={handleAnimationRestart}
                      className="p-3 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-md transition"
                    >
                      <RotateCcw size={32} />
                    </button>
                  </div>

                  {/* Playback Speed */}
                  <div className="flex flex-col items-center">
                    <label htmlFor="playback-speed" className="text-sm text-gray-400 mb-2">
                      Playback Speed
                    </label>
                    <input
                      id="playback-speed"
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      defaultValue="1"
                      onChange={(e) => {
                        if (animationRef.current) {
                          animationRef.current.playbackRate = parseFloat(e.target.value);
                        }
                      }}
                      className="w-48"
                    />
                  </div>

                  {/* Loop Toggle */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="loop-toggle" className="text-sm text-gray-400">
                      Loop
                    </label>
                    <input
                      id="loop-toggle"
                      type="checkbox"
                      defaultChecked
                      onChange={(e) => {
                        if (animationRef.current) {
                          animationRef.current.loop = e.target.checked;
                        }
                      }}
                      className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {previewSection === 'settings' && (
              <div className="bg-[#1E1F23] rounded-lg p-6 shadow-md">
                <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Grid Size */}
                  <div className="flex flex-col">
                    <label htmlFor="grid-size" className="text-sm text-gray-400 mb-2">
                      Grid Size
                    </label>
                    <input
                      id="grid-size"
                      type="text"
                      value={gridSize}
                      onChange={(e) => setGridSize(e.target.value)}
                      placeholder="Auto"
                      className="bg-[#2A2B2F] text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* FPS */}
                  <div className="flex flex-col">
                    <label htmlFor="fps" className="text-sm text-gray-400 mb-2">
                      Frames Per Second (FPS)
                    </label>
                    <input
                      id="fps"
                      type="number"
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="bg-[#2A2B2F] text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Quality */}
                  <div className="flex flex-col">
                    <label htmlFor="quality" className="text-sm text-gray-400 mb-2">
                      Quality
                    </label>
                    <select
                      id="quality"
                      value="High"
                      onChange={(e) => console.log(e.target.value)}
                      className="bg-[#2A2B2F] text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>

                  {/* Additional Settings */}
                  <div className="flex flex-col">
                    <label htmlFor="theme" className="text-sm text-gray-400 mb-2">
                      Theme
                    </label>
                    <select
                      id="theme"
                      value="Dark"
                      onChange={(e) => console.log(e.target.value)}
                      className="bg-[#2A2B2F] text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Dark">Dark</option>
                      <option value="Light">Light</option>
                    </select>
                  </div>
                </div>

                {/* Save Button */}
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => console.log('Settings saved')}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Move "Generate Asset IDs" section below the preview section */}
        {showCodeSection && (
          <div className="bg-[#1E1F23] rounded-lg p-4 shadow-md mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Code size={18} /> Generate Asset IDs
            </h3>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                min="1"
                placeholder="How many assets?"
                value={lookupCount}
                onChange={(e) => setLookupCount(Number(e.target.value))}
                className="bg-[#2A2B2F] text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Your Creator ID"
                value={lookupCreatorId}
                onChange={(e) => setLookupCreatorId(e.target.value)}
                className="bg-[#2A2B2F] text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                placeholder=".ROBLOSECURITY cookie"
                value={roblosecurity}
                onChange={(e) => setRoblosecurity(e.target.value)}
                className="bg-[#2A2B2F] text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={async () => {
                  if (!lookupCount || !lookupCreatorId || !roblosecurity) {
                    addOutputLog("Enter Creator ID, count, and cookie", "warning");
                    return;
                  }

                  // Allowed limits for the API
                  const allowedLimits = [10, 25, 50, 100];
                  const closestLimit = allowedLimits.find((limit) => limit >= lookupCount) || allowedLimits[allowedLimits.length - 1];

                  try {
                    const ids = await window.electronAPI.listUserAssets(lookupCreatorId, closestLimit, roblosecurity);
                    const limitedIds = ids.slice(0, lookupCount); 
                    const lua = [
                      "local Flipbooks = {",
                      ...limitedIds.map((id, i) => `  { ImageId = "rbxassetid://${id}", GridSize = Vector2.new(1,1) },`),
                      "};",
                      "return Flipbooks;",
                    ].join("\n");
                    setGeneratedIdsCode(lua);
                  } catch (err) {
                    addOutputLog(`Lookup failed: ${err.message}`, "error");
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Generate IDs
              </button>
            </div>
            <div className="relative">
              <SyntaxHighlighter
                language="lua"
                style={materialDark}
                className="bg-black/60 rounded-lg p-4 font-mono text-sm overflow-auto max-h-64"
              >
                {generatedIdsCode || "// No code generated yet"}
              </SyntaxHighlighter>
              <button
                onClick={copyGeneratedCode}
                className="absolute top-2 right-2 text-gray-400 hover:text-white transition"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        )}

        {/* History Section */}
        {showHistory && active?.history?.length > 0 && (
          <div className="mt-4 p-4 bg-[#1E1F23] rounded-lg shadow-lg mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-300">Export History</h3>
              <input
                type="date"
                className="bg-[#2A2B2F] text-gray-300 text-sm rounded px-2 py-1"
                onChange={(e) => setHistoryFilterDate(e.target.value)}
              />
            </div>
            <ul className="text-xs text-gray-400 space-y-1">
              {filteredHistory.map((entry, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>{entry.format} → {entry.file.split(/[/\\]/).pop()}</span>
                  <span>{new Date(entry.time).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Output Section */}
        {showOutput && (
          <div
            className="relative mt-4 p-4 bg-[#1E1F23] rounded-lg shadow-lg backdrop-blur-md"
            style={{
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
              fontFamily: 'Fira Code, monospace',
            }}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-300">Output Logs</h3>
              <div className="flex gap-2">
                <button
                  onClick={copyOutputLogs}
                  className="text-gray-400 hover:text-white transition"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={clearOutputLogs}
                  className="text-gray-400 hover:text-white transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div style={{ maxHeight: isOutputCollapsed ? 'none' : '150px', overflow: 'hidden' }}>
              {outputLogs.slice(0, isOutputCollapsed ? outputLogs.length : 7).map((log, idx) => (
                <div
                  key={idx}
                  className={`mb-1 px-2 py-1 rounded ${
                    log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'warning'
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }`}
                >
                  <span className="text-gray-500">
                    [{log.time.toLocaleTimeString()}]
                  </span>{' '}
                  {log.message}
                </div>
              ))}
            </div>
            {outputLogs.length > 7 && (
              <button
                onClick={() => setIsOutputCollapsed((prev) => !prev)}
                className="text-blue-400 hover:text-blue-500 mt-2 text-sm flex items-center"
              >
                <span
                  className={`transform transition-transform ${
                    isOutputCollapsed ? 'rotate-180' : ''
                  }`}
                >
                  ▼
                </span>
              </button>
            )}
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="absolute bg-transparent text-white rounded p-2"
          >
            <button
              onClick={() => duplicateTab(contextMenu.tab)}
              className="block w-full text-left px-4 py-2 rounded-lg backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 hover:border-white/40 transition-all"
            >
              Duplicate
            </button>
          </div>
        )}

        {/* Notification */}
        {tabs.some(tab => tab.alert) && (
          <AnimatePresence>
            {tabs.map(tab => tab.alert && (
              <motion.div
                key={tab.id}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`fixed top-16 right-4 px-4 py-2 rounded shadow-lg backdrop-blur-md ${
                  tab.alert.type === 'success' ? 'bg-green-600/80' :
                  tab.alert.type === 'error' ? 'bg-red-600/80' : 'bg-yellow-600/80'
                } text-white`}
              >
                {tab.alert.message}
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {showNotif && (
          <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
            {notifMessage}
          </div>
        )}
      </div>
    </>
  );
}

