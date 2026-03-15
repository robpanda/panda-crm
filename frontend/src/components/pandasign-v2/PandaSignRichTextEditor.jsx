import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Pilcrow,
} from 'lucide-react';

const TOOLBAR_ACTIONS = [
  { icon: Bold, label: 'Bold', command: 'bold' },
  { icon: Italic, label: 'Italic', command: 'italic' },
  { icon: Underline, label: 'Underline', command: 'underline' },
  { icon: Heading1, label: 'H1', command: 'formatBlock', value: '<h1>' },
  { icon: Heading2, label: 'H2', command: 'formatBlock', value: '<h2>' },
  { icon: Pilcrow, label: 'Paragraph', command: 'formatBlock', value: '<p>' },
  { icon: List, label: 'Bullets', command: 'insertUnorderedList' },
  { icon: ListOrdered, label: 'Numbered', command: 'insertOrderedList' },
];

const PandaSignRichTextEditor = forwardRef(function PandaSignRichTextEditor({ value, onChange, onInsertToken }, ref) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const runCommand = (command, commandValue = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange?.(editorRef.current?.innerHTML || '');
  };

  const handleInput = () => {
    onChange?.(editorRef.current?.innerHTML || '');
  };

  const insertTokenAtCursor = (token) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, token);
    onChange?.(editorRef.current?.innerHTML || '');
    onInsertToken?.(token);
  };

  useImperativeHandle(ref, () => ({
    insertToken(token) {
      insertTokenAtCursor(token);
    },
    focus() {
      editorRef.current?.focus();
    },
  }));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
        {TOOLBAR_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={`${action.label}-${action.command}`}
              type="button"
              onClick={() => runCommand(action.command, action.value)}
              className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
            >
              <Icon className="mr-1 h-4 w-4" />
              {action.label}
            </button>
          );
        })}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="min-h-[360px] w-full rounded-b-2xl px-4 py-4 text-sm text-gray-900 focus:outline-none"
      />
      <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
        Tip: use the merge field chips to insert tokens like <code>{'{{dynamic.rescission_clause}}'}</code>.
      </div>
    </div>
  );
});

export default PandaSignRichTextEditor;
