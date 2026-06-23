export function StatusMessage({
  message,
  tone = 'error',
}: {
  message: string;
  tone?: 'error' | 'success';
}) {
  return (
    <div
      className={`mb-4 border px-4 py-3 text-sm ${
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-800'
      }`}
      style={{ borderRadius: 6 }}
    >
      {message}
    </div>
  );
}
