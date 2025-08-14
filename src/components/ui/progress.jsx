export function Progress({ value }) {
    return (
      <div className="w-full h-3 bg-white/10 rounded">
        <div
          className="h-full rounded bg-[#7289DA] transition-all"
          style={{ width: `${value}%` }}
        ></div>
      </div>
    );
  }
  