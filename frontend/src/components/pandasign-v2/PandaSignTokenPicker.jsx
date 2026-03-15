import { Tag } from 'lucide-react';
import { TOKEN_GROUPS, getTokenLabel } from './pandasignV2AdminUtils';

export default function PandaSignTokenPicker({ dynamicContentItems = [], onInsertToken }) {
  const dynamicTokens = dynamicContentItems
    .filter((item) => item?.key)
    .map((item) => `{{dynamic.${item.key}}}`);

  const groups = TOKEN_GROUPS.map((group) => (
    group.label === 'Dynamic Content'
      ? { ...group, tokens: [...new Set([...group.tokens, ...dynamicTokens])] }
      : group
  ));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="h-4 w-4 text-panda-primary" />
        <h3 className="text-sm font-semibold text-gray-900">Merge Fields</h3>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.tokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => onInsertToken?.(token)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 transition hover:border-panda-primary hover:text-panda-primary"
                >
                  {getTokenLabel(token)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
