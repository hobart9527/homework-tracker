interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-md p-4 ${
        onClick ? "cursor-pointer hover:shadow-lg transition-shadow" : ""
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
