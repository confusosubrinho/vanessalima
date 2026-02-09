import logo from '@/assets/logo.png';

export function PageLoading() {
  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center animate-fade-in">
      <img
        src={logo}
        alt="Vanessa Lima Shoes"
        className="h-16 mb-6 animate-pulse"
      />
      <div className="flex gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
