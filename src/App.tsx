import { MenuBar } from '@/components/layout/MenuBar';
import { FileBridge } from '@/components/layout/FileBridge';
import { StatusBar } from '@/components/layout/StatusBar';
import SidePanel from '@/components/panels/SidePanel';
import { ViewportArea } from '@/components/viewports/ViewportArea';
import { Modal } from '@/components/ui/Modal';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useEditorStore } from '@/store/editorStore';

export default function App() {
  useKeyboard();
  const maximizedVP = useEditorStore((s) => s.maximizedVP);

  return (
    <div className="app-shell">
      <FileBridge />
      <MenuBar />
      <div className={`app-main ${maximizedVP ? 'app-main--maximized' : ''}`}>
        <ViewportArea />
        <SidePanel />
      </div>
      <StatusBar />
      <Modal />
    </div>
  );
}
