import { useNavigate } from 'react-router-dom';

export default function AdvancedReportEditor() {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Advanced Report Editor</h1>
        <p className="text-gray-500 mb-6">
          Advanced editor is being finalized. Use the standard report builder for now.
        </p>
        <button
          onClick={() => navigate('/analytics/reports/new')}
          className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
        >
          Open Report Builder
        </button>
      </div>
    </div>
  );
}
