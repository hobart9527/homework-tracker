export default function ReaderLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 border-4 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
        <p className="text-slate-600 text-sm">Loading...</p>
      </div>
    </div>
  );
}
