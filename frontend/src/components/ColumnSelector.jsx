import { useState, useEffect, useRef } from 'react';
import { Settings2, Check, GripVertical, RotateCcw } from 'lucide-react';

/**
 * ColumnSelector - Allows users to show/hide and reorder table columns
 *
 * Usage:
 * const [visibleColumns, setVisibleColumns] = useState(['name', 'email', 'phone']);
 * <ColumnSelector
 *   columns={COLUMN_DEFINITIONS}
 *   visibleColumns={visibleColumns}
 *   onChange={setVisibleColumns}
 *   storageKey="contacts-columns"
 * />
 */
export default function ColumnSelector({
  columns,
  visibleColumns,
  onChange,
  storageKey,
  defaultColumns,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load saved column preferences on mount
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`column-prefs-${storageKey}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Validate that all saved columns still exist
          const validColumns = parsed.filter((key) =>
            columns.some((col) => col.key === key)
          );
          if (validColumns.length > 0) {
            onChange(validColumns);
          }
        } catch (e) {
          console.error('Failed to parse column preferences:', e);
        }
      }
    }
  }, [storageKey]);

  // Save preferences when they change
  const handleChange = (newColumns) => {
    onChange(newColumns);
    if (storageKey) {
      localStorage.setItem(`column-prefs-${storageKey}`, JSON.stringify(newColumns));
    }
  };

  const toggleColumn = (columnKey) => {
    const isVisible = visibleColumns.includes(columnKey);
    let newColumns;

    if (isVisible) {
      // Don't allow hiding all columns - keep at least one
      if (visibleColumns.length <= 1) return;
      newColumns = visibleColumns.filter((key) => key !== columnKey);
    } else {
      // Add column at its original position
      const originalIndex = columns.findIndex((col) => col.key === columnKey);
      const insertAfterIndex = visibleColumns.findIndex((key) => {
        const visibleColIndex = columns.findIndex((col) => col.key === key);
        return visibleColIndex > originalIndex;
      });

      if (insertAfterIndex === -1) {
        newColumns = [...visibleColumns, columnKey];
      } else {
        newColumns = [
          ...visibleColumns.slice(0, insertAfterIndex),
          columnKey,
          ...visibleColumns.slice(insertAfterIndex),
        ];
      }
    }

    handleChange(newColumns);
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newColumns = [...visibleColumns];
    const draggedColumn = newColumns[draggedIndex];
    newColumns.splice(draggedIndex, 1);
    newColumns.splice(index, 0, draggedColumn);

    setDraggedIndex(index);
    handleChange(newColumns);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const resetToDefault = () => {
    const defaults = defaultColumns || columns.filter((col) => col.defaultVisible !== false).map((col) => col.key);
    handleChange(defaults);
    if (storageKey) {
      localStorage.removeItem(`column-prefs-${storageKey}`);
    }
  };

  // Sort columns: visible first (in order), then hidden
  const sortedColumns = [
    ...visibleColumns.map((key) => columns.find((col) => col.key === key)).filter(Boolean),
    ...columns.filter((col) => !visibleColumns.includes(col.key)),
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
          isOpen
            ? 'bg-panda-primary text-white border-panda-primary'
            : 'text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
        }`}
        title="Configure columns"
      >
        <Settings2 className="w-4 h-4" />
        <span className="hidden sm:inline">Columns</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Visible Columns</h3>
              <button
                onClick={resetToDefault}
                className="flex items-center space-x-1 text-xs text-gray-500 hover:text-panda-primary"
                title="Reset to default"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Drag to reorder. Click to show/hide.
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {sortedColumns.map((column, index) => {
              const isVisible = visibleColumns.includes(column.key);
              const isRequired = column.required === true;
              const visibleIndex = visibleColumns.indexOf(column.key);

              return (
                <div
                  key={column.key}
                  draggable={isVisible && !isRequired}
                  onDragStart={() => isVisible && handleDragStart(visibleIndex)}
                  onDragOver={(e) => isVisible && handleDragOver(e, visibleIndex)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center space-x-2 px-2 py-2 rounded-lg transition-colors ${
                    isVisible
                      ? 'bg-gray-50'
                      : 'opacity-60'
                  } ${
                    draggedIndex === visibleIndex ? 'bg-panda-primary/10' : ''
                  } ${
                    isVisible && !isRequired ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                >
                  {/* Drag handle */}
                  <div className={`flex-shrink-0 ${isVisible && !isRequired ? 'text-gray-400' : 'text-transparent'}`}>
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* Checkbox */}
                  <button
                    onClick={() => !isRequired && toggleColumn(column.key)}
                    disabled={isRequired}
                    className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      isVisible
                        ? 'bg-panda-primary border-panda-primary text-white'
                        : 'border-gray-300 hover:border-gray-400'
                    } ${isRequired ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {isVisible && <Check className="w-3 h-3" />}
                  </button>

                  {/* Label */}
                  <span className={`flex-1 text-sm ${isVisible ? 'text-gray-900' : 'text-gray-500'}`}>
                    {column.label}
                    {isRequired && (
                      <span className="ml-1 text-xs text-gray-400">(required)</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="p-2 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <p className="text-xs text-gray-500 text-center">
              {visibleColumns.length} of {columns.length} columns visible
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to manage column visibility state with localStorage persistence
 */
export function useColumnVisibility(columns, storageKey, defaultColumns) {
  const getDefaultColumns = () => {
    if (defaultColumns) return defaultColumns;
    return columns.filter((col) => col.defaultVisible !== false).map((col) => col.key);
  };

  const [visibleColumns, setVisibleColumns] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`column-prefs-${storageKey}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const validColumns = parsed.filter((key) =>
            columns.some((col) => col.key === key)
          );
          if (validColumns.length > 0) return validColumns;
        } catch (e) {
          // Fall through to defaults
        }
      }
    }
    return getDefaultColumns();
  });

  const setColumns = (newColumns) => {
    setVisibleColumns(newColumns);
    if (storageKey) {
      localStorage.setItem(`column-prefs-${storageKey}`, JSON.stringify(newColumns));
    }
  };

  const resetColumns = () => {
    const defaults = getDefaultColumns();
    setVisibleColumns(defaults);
    if (storageKey) {
      localStorage.removeItem(`column-prefs-${storageKey}`);
    }
  };

  const isColumnVisible = (key) => visibleColumns.includes(key);

  const getVisibleColumns = () => {
    return visibleColumns
      .map((key) => columns.find((col) => col.key === key))
      .filter(Boolean);
  };

  return {
    visibleColumns,
    setVisibleColumns: setColumns,
    resetColumns,
    isColumnVisible,
    getVisibleColumns,
  };
}
