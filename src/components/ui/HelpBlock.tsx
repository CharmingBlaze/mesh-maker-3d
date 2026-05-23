import type { HelpTopic } from '@/systems/help/editorHelp';

export function HelpBlock({
  topic,
  className = 'ms-help-block ms-help-block--topic',
}: {
  topic: HelpTopic;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="ms-help-line ms-help-line--title">{topic.title}</div>
      {topic.intro && <div className="ms-help-line">{topic.intro}</div>}
      {topic.lines.length > 0 && (
        <ul className="ms-help-list">
          {topic.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
