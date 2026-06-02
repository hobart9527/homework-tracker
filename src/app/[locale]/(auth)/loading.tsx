export default function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-forest-50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 border-4 border-forest-200 border-t-forest-500 rounded-full animate-spin" />
        <p className="text-forest-900 text-sm">Loading...</p>
      </div>
    </div>
  );
}
