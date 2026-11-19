import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Editor, type EditorSource } from './ui/Editor';
import { StudioCamera } from './ui/StudioCamera';
import { Home, Library, SettingsScreen } from './ui/Screens';
import { pickFromGallery, takeWithPhoneCamera, isNative } from './lib/platform';
import { hasAiKey, loadSettings, saveSettings, type Project, type Settings } from './lib/storage';

type Screen =
  | { name: 'home' }
  | { name: 'editor'; source: EditorSource }
  | { name: 'camera' }
  | { name: 'library' }
  | { name: 'settings' };

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ name: 'home' }]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const screen = stack[stack.length - 1];

  const push = (s: Screen) => setStack((st) => [...st, s]);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const replace = (s: Screen) => setStack((st) => [...st.slice(0, -1), s]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3800);
  }, []);

  // Botón "atrás" de Android
  const stackLen = useRef(1);
  stackLen.current = stack.length;
  useEffect(() => {
    if (!isNative) return;
    const h = CapApp.addListener('backButton', () => {
      if (stackLen.current > 1) back();
      else CapApp.exitApp();
    });
    return () => { h.then((x) => x.remove()); };
  }, [back]);

  const updateSettings = (s: Settings) => { setSettings(s); saveSettings(s); };

  const openBlob = (blob: Blob | null, presetId: string | null = null) => {
    if (blob) push({ name: 'editor', source: { blob, presetId } });
  };
  const fromGallery = async () => {
    try { openBlob(await pickFromGallery()); } catch (e) { toast(String((e as Error).message ?? e)); }
  };
  const fromPhoneCamera = async (presetId: string | null = 'nolan') => {
    try { openBlob(await takeWithPhoneCamera(), presetId); } catch (e) { toast(`Cámara: ${(e as Error).message ?? e}`); }
  };
  const openProject = (p: Project) => push({ name: 'editor', source: { blob: p.original, edit: p.edit, projectId: p.id } });

  let view;
  switch (screen.name) {
    case 'home':
      view = (
        <Home
          hasKey={hasAiKey(settings)}
          onGallery={fromGallery}
          onPhoneCamera={() => fromPhoneCamera()}
          onStudioCamera={() => push({ name: 'camera' })}
          onLibrary={() => push({ name: 'library' })}
          onSettings={() => push({ name: 'settings' })}
          onOpenProject={openProject}
        />
      );
      break;
    case 'editor':
      view = <Editor key={stack.length} source={screen.source} settings={settings} onBack={back} onOpenSettings={() => push({ name: 'settings' })} toast={toast} />;
      break;
    case 'camera':
      view = (
        <StudioCamera
          settings={settings}
          toast={toast}
          onBack={back}
          onCapture={(blob, presetId) => replace({ name: 'editor', source: { blob, presetId } })}
          onPhoneCamera={async () => { back(); await fromPhoneCamera(); }}
        />
      );
      break;
    case 'library':
      view = <Library onBack={back} onOpen={openProject} />;
      break;
    case 'settings':
      view = <SettingsScreen settings={settings} onChange={updateSettings} onBack={back} />;
      break;
  }

  return (
    <>
      {view}
      {toastMsg && <div className="toast" onClick={() => setToastMsg(null)}>{toastMsg}</div>}
    </>
  );
}
