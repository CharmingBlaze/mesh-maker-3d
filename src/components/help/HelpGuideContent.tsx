import { HelpBlock } from '@/components/ui/HelpBlock';
import { HELP_MENU_TOPICS, QUICK_REFERENCE } from '@/systems/help/editorHelp';

const FILE_SHORTCUTS = [
  ['Ctrl+N', 'New'],
  ['Ctrl+O', 'Open'],
  ['Ctrl+S', 'Save'],
  ['Ctrl+E', 'Export OBJ'],
  ['Shift+F', 'Frame all'],
  ['Space', 'Maximize view'],
] as const;

export function HelpGuideContent() {
  return (
    <div className="help-guide-menu">
      <div className="ms-help-line help-guide-quick">{QUICK_REFERENCE}</div>
      {HELP_MENU_TOPICS.map((topic) => (
        <HelpBlock key={topic.id} topic={topic} />
      ))}
      <div className="help-guide-shortcuts">
        {FILE_SHORTCUTS.map(([key, label]) => (
          <div key={key}>
            <span>{key}</span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
