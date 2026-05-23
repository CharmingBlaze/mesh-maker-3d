import { MenuBar } from '@/components/layout/MenuBar';
import { FileBridge } from '@/components/layout/FileBridge';
import { PrimDrawHUD } from '@/components/layout/PrimDrawHUD';
import { StatusBar } from '@/components/layout/StatusBar';
import SidePanel from '@/components/panels/SidePanel';
import { ScenePanel } from '@/components/panels/ScenePanel';
import { ViewportArea } from '@/components/viewports/ViewportArea';
import { Modal } from '@/components/ui/Modal';
import { useKeyboard } from '@/hooks/useKeyboard';
export default function App() {
  useKeyboard();

  return (
    <div className="app-shell">
      <FileBridge />
      <MenuBar />
      <div className="app-main">
        <ScenePanel />
        <ViewportArea />
        <SidePanel />
        <PrimDrawHUD />
      </div>
      <StatusBar />
      <Modal />
    </div>
  );
}
