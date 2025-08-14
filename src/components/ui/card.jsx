export function Card({ children, className = "", ...props }) {
    return (
      <div className={`rounded-xl bg-white/5 p-6 backdrop-blur ${className}`} {...props}>
        {children}
      </div>
    );
  }
  