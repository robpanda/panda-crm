import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Underline,
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

const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Courier New', value: 'Courier New' },
];

const PANDA_LOGO_PATH = '/panda-logo.svg';

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nodeBelongsToEditor(editorElement, node) {
  return Boolean(editorElement && node && editorElement.contains(node));
}

const PandaSignRichTextEditor = forwardRef(function PandaSignRichTextEditor({ value, onChange, onInsertToken }, ref) {
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const selectionRangeRef = useRef(null);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [textColor, setTextColor] = useState('#111827');
  const [highlightColor, setHighlightColor] = useState('#FEF3C7');
  const [tableBorderColor, setTableBorderColor] = useState('#D1D5DB');
  const [tableFillColor, setTableFillColor] = useState('#F9FAFB');
  const [dividerColor, setDividerColor] = useState('#D1D5DB');
  const [tableActionsEnabled, setTableActionsEnabled] = useState(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const emitChange = () => {
    onChange?.(editorRef.current?.innerHTML || '');
  };

  const getSelectionContainer = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (nodeBelongsToEditor(editorRef.current, range.commonAncestorContainer)) {
        return range.startContainer;
      }
    }

    const storedRange = selectionRangeRef.current;
    if (storedRange && nodeBelongsToEditor(editorRef.current, storedRange.commonAncestorContainer)) {
      return storedRange.startContainer;
    }

    return null;
  };

  const getClosestCell = () => {
    let node = getSelectionContainer();
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    if (!(node instanceof Element)) return null;
    return node.closest('td, th');
  };

  const updateTableActionState = () => {
    setTableActionsEnabled(Boolean(getClosestCell()));
  };

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (nodeBelongsToEditor(editorRef.current, range.commonAncestorContainer)) {
        selectionRangeRef.current = range.cloneRange();
      }
    }
    updateTableActionState();
  };

  const restoreSelection = () => {
    const storedRange = selectionRangeRef.current;
    if (!storedRange) return;

    const selection = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(storedRange);
  };

  const focusEditor = () => {
    editorRef.current?.focus();
    restoreSelection();
  };

  const placeCaretInNode = (node) => {
    if (!node) return;

    const range = document.createRange();
    if (node.nodeType === Node.TEXT_NODE) {
      range.setStart(node, 0);
    } else {
      range.selectNodeContents(node);
      range.collapse(true);
    }

    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    selectionRangeRef.current = range.cloneRange();
    updateTableActionState();
  };

  const runCommand = (command, commandValue = null) => {
    focusEditor();
    if (command === 'foreColor' || command === 'hiliteColor' || command === 'fontName') {
      document.execCommand('styleWithCSS', false, true);
    }
    document.execCommand(command, false, commandValue);
    rememberSelection();
    emitChange();
  };

  const insertHtml = (html) => {
    focusEditor();
    document.execCommand('insertHTML', false, html);
    rememberSelection();
    emitChange();
  };

  const handleInput = () => {
    rememberSelection();
    emitChange();
  };

  const insertTokenAtCursor = (token) => {
    focusEditor();
    document.execCommand('insertText', false, token);
    rememberSelection();
    emitChange();
    onInsertToken?.(token);
  };

  const insertTable = () => {
    const html = `
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <thead>
          <tr>
            <th style="border:1px solid ${tableBorderColor}; background:${tableFillColor}; padding:8px; text-align:left;">Header 1</th>
            <th style="border:1px solid ${tableBorderColor}; background:${tableFillColor}; padding:8px; text-align:left;">Header 2</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid ${tableBorderColor}; padding:8px;">Editable value</td>
            <td style="border:1px solid ${tableBorderColor}; padding:8px;">Editable value</td>
          </tr>
          <tr>
            <td style="border:1px solid ${tableBorderColor}; padding:8px;">Editable value</td>
            <td style="border:1px solid ${tableBorderColor}; padding:8px;">Editable value</td>
          </tr>
        </tbody>
      </table>
    `;
    insertHtml(html);
  };

  const deleteCurrentTableRow = () => {
    const cell = getClosestCell();
    const row = cell?.closest('tr');
    const table = cell?.closest('table');
    if (!row || !table) return;

    row.remove();
    if (!table.querySelector('tr')) {
      table.remove();
      placeCaretInNode(editorRef.current);
    } else {
      placeCaretInNode(table.querySelector('td, th'));
    }
    emitChange();
  };

  const deleteCurrentTableColumn = () => {
    const cell = getClosestCell();
    const table = cell?.closest('table');
    if (!cell || !table) return;

    const columnIndex = cell.cellIndex;
    Array.from(table.querySelectorAll('tr')).forEach((row) => {
      const targetCell = row.cells?.[columnIndex];
      if (targetCell) {
        targetCell.remove();
      }
      if (row.cells.length === 0) {
        row.remove();
      }
    });

    if (!table.querySelector('tr')) {
      table.remove();
      placeCaretInNode(editorRef.current);
    } else {
      placeCaretInNode(table.querySelector('td, th'));
    }
    emitChange();
  };

  const insertDivider = () => {
    insertHtml(`<hr style="border:0; border-top:2px solid ${dividerColor}; margin:16px 0;" />`);
  };

  const insertImage = (src, alt = 'Inserted image') => {
    if (!src) return;
    insertHtml(
      `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" style="display:block; max-width:100%; height:auto; margin:16px 0; border-radius:12px;" />`
    );
  };

  const insertPandaLogo = () => {
    const absoluteLogoUrl = new URL(PANDA_LOGO_PATH, window.location.origin).toString();
    insertHtml(
      `<img src="${escapeAttribute(absoluteLogoUrl)}" alt="Panda Logo" style="display:block; width:180px; max-width:100%; height:auto; margin:16px 0;" />`
    );
  };

  const handleInsertImageUrl = () => {
    const imageUrl = window.prompt('Paste the image URL to insert into the document.');
    if (!imageUrl) return;
    insertImage(imageUrl.trim(), 'Inserted image');
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      insertImage(String(reader.result || ''), file.name);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  useImperativeHandle(ref, () => ({
    insertToken(token) {
      insertTokenAtCursor(token);
    },
    focus() {
      focusEditor();
    },
  }));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-gray-200 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {TOOLBAR_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={`${action.label}-${action.command}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runCommand(action.command, action.value)}
                className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
              >
                <Icon className="mr-1 h-4 w-4" />
                {action.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-medium text-gray-600">
            Font
            <select
              value={fontFamily}
              onChange={(event) => {
                const nextFont = event.target.value;
                setFontFamily(nextFont);
                runCommand('fontName', nextFont);
              }}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-gray-600">
            Text Color
            <input
              type="color"
              value={textColor}
              onChange={(event) => {
                const nextColor = event.target.value;
                setTextColor(nextColor);
                runCommand('foreColor', nextColor);
              }}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-1"
            />
          </label>

          <label className="text-xs font-medium text-gray-600">
            Highlight
            <input
              type="color"
              value={highlightColor}
              onChange={(event) => {
                const nextColor = event.target.value;
                setHighlightColor(nextColor);
                runCommand('hiliteColor', nextColor);
              }}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-1"
            />
          </label>

          <label className="text-xs font-medium text-gray-600">
            Table Line Color
            <input
              type="color"
              value={tableBorderColor}
              onChange={(event) => setTableBorderColor(event.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-1"
            />
          </label>

          <label className="text-xs font-medium text-gray-600">
            Table Fill Color
            <input
              type="color"
              value={tableFillColor}
              onChange={(event) => setTableFillColor(event.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-1"
            />
          </label>

          <label className="text-xs font-medium text-gray-600">
            Divider Color
            <input
              type="color"
              value={dividerColor}
              onChange={(event) => setDividerColor(event.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-1"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertTable}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
          >
            Insert Table
          </button>
          <button
            type="button"
            disabled={!tableActionsEnabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={deleteCurrentTableRow}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete Row
          </button>
          <button
            type="button"
            disabled={!tableActionsEnabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={deleteCurrentTableColumn}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete Column
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertDivider}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
          >
            Insert Divider
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertPandaLogo}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
          >
            Insert Panda Logo
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleInsertImageUrl}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
          >
            Insert Image URL
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => imageInputRef.current?.click()}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:border-panda-primary hover:text-panda-primary"
          >
            Upload Image
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={rememberSelection}
        className="min-h-[360px] w-full rounded-b-2xl px-4 py-4 text-sm text-gray-900 focus:outline-none"
      />
      <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
        Tip: use the merge field chips to insert tokens like <code>{'{{dynamic.rescission_clause}}'}</code>.
      </div>
    </div>
  );
});

export default PandaSignRichTextEditor;
