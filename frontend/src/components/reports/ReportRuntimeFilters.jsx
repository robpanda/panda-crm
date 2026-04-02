import GlobalDateRangePicker from './GlobalDateRangePicker';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function renderRangeInputs(definition, value, onChange) {
  const nextValue = value && typeof value === 'object' ? value : { start: '', end: '' };
  const inputType = definition.controlType === 'date-range' ? 'date' : 'text';
  const startLabel = definition.controlType === 'date-range' ? 'Start date' : 'Start value';
  const endLabel = definition.controlType === 'date-range' ? 'End date' : 'End value';

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input
        type={inputType}
        aria-label={`${definition.label} ${startLabel}`}
        value={nextValue.start || ''}
        onChange={(event) => onChange(definition.id, {
          ...nextValue,
          start: event.target.value,
        })}
        placeholder={startLabel}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:ring-2 focus:ring-panda-primary"
      />
      <input
        type={inputType}
        aria-label={`${definition.label} ${endLabel}`}
        value={nextValue.end || ''}
        onChange={(event) => onChange(definition.id, {
          ...nextValue,
          end: event.target.value,
        })}
        placeholder={endLabel}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:ring-2 focus:ring-panda-primary"
      />
    </div>
  );
}

function renderSelect(definition, value, onChange, multiple = false) {
  const normalizedValue = multiple ? toArray(value) : (value || '');

  return (
    <select
      multiple={multiple}
      value={normalizedValue}
      onChange={(event) => {
        if (multiple) {
          const selected = [...event.target.selectedOptions].map((option) => option.value);
          onChange(definition.id, selected);
          return;
        }

        onChange(definition.id, event.target.value);
      }}
      className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:ring-2 focus:ring-panda-primary ${multiple ? 'min-h-[6rem]' : ''}`}
      aria-label={definition.label}
    >
      {!multiple && <option value="">Any</option>}
      {definition.options.map((option) => (
        <option key={`${definition.id}-${option.value}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function renderTextInput(definition, value, onChange) {
  const inputType = definition.controlType === 'date' ? 'date' : 'text';
  const placeholder = definition.controlType === 'date' ? '' : (definition.placeholder || 'Enter value');

  return (
    <input
      type={inputType}
      aria-label={definition.label}
      value={value || ''}
      onChange={(event) => onChange(definition.id, event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-panda-primary focus:ring-2 focus:ring-panda-primary"
    />
  );
}

function renderFilterControl(definition, value, onChange) {
  if (definition.controlType === 'date-range' || definition.controlType === 'range') {
    return renderRangeInputs(definition, value, onChange);
  }

  if (definition.controlType === 'multi-select') {
    return renderSelect(definition, value, onChange, true);
  }

  if (definition.controlType === 'select') {
    return renderSelect(definition, value, onChange, false);
  }

  return renderTextInput(definition, value, onChange);
}

export default function ReportRuntimeFilters({
  dateRange = null,
  onDateRangeChange,
  definitions = [],
  values = {},
  onValueChange,
  onRun,
  running = false,
}) {
  const hasFieldControls = definitions.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
      <div className={`flex flex-col gap-4 ${hasFieldControls ? '' : 'sm:flex-row sm:items-center sm:justify-between'}`}>
        {(dateRange || hasFieldControls) && (
          <div className="flex-1 space-y-4">
            {dateRange && (
              <div className="flex items-center gap-4">
                <GlobalDateRangePicker
                  value={dateRange}
                  onChange={onDateRangeChange}
                  showComparison={true}
                />
              </div>
            )}

            {hasFieldControls && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {definitions.map((definition) => (
                  <div key={definition.id} className="space-y-1">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {definition.label}
                    </label>
                    {definition.operatorLabel && definition.operatorLabel !== 'Equals' && (
                      <p className="text-xs text-gray-400">{definition.operatorLabel}</p>
                    )}
                    {renderFilterControl(definition, values[definition.id], onValueChange)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={`flex ${dateRange || hasFieldControls ? 'justify-end' : 'justify-end'} shrink-0`}>
          <button
            onClick={onRun}
            disabled={running}
            className="px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {running && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            Run Report
          </button>
        </div>
      </div>
    </div>
  );
}
