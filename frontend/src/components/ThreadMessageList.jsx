function MentionHighlightedText({ text = '' }) {
  const value = String(text || '');
  const parts = value.split(/(@[\w.-]+(?:\s+[\w.-]+)?)/g);

  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith('@')) {
          return (
            <span key={`${part}-${idx}`} className="font-medium text-panda-primary">
              {part}
            </span>
          );
        }
        return <span key={`${part}-${idx}`}>{part}</span>;
      })}
    </>
  );
}

export function ThreadBody({ text = '', className = 'text-sm text-gray-700 whitespace-pre-wrap' }) {
  return (
    <p className={className}>
      <MentionHighlightedText text={text} />
    </p>
  );
}

export default function ThreadMessageList({
  items = [],
  renderItem,
  emptyTitle = 'No messages yet',
  emptyDescription = null,
  className = 'space-y-3',
}) {
  if (!Array.isArray(items) || items.length === 0) {
    if (!emptyTitle && !emptyDescription) {
      return null;
    }
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        <p className="font-medium text-gray-700">{emptyTitle}</p>
        {emptyDescription && <p className="mt-1 text-gray-500">{emptyDescription}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map((item) => renderItem(item))}
    </div>
  );
}
