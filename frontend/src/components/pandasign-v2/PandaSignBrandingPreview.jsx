import { Eye } from 'lucide-react';
import { renderTemplatePreview } from './pandasignV2AdminUtils';

export default function PandaSignBrandingPreview({
  title,
  content,
  territory = 'DEFAULT',
  resources,
}) {
  const html = renderTemplatePreview({
    territory,
    branding: {},
    content,
  }, resources);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Eye className="h-4 w-4 text-panda-primary" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div
        className="prose prose-sm max-w-none rounded-2xl bg-gray-50 p-4"
        dangerouslySetInnerHTML={{ __html: html || '<p class="text-gray-400">Preview unavailable</p>' }}
      />
    </div>
  );
}
