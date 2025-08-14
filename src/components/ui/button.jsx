export function Button({ children, ...props }) {
    return (
      <button
        className="px-4 py-2 rounded bg-[#7289DA] hover:bg-[#5b6eae] transition text-white"
        {...props}
      >
        {children}
      </button>
    );
  }
  