import { useState } from "react";

export default function InfoTooltip({ text }) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-gray-400 text-white text-[10px] font-bold
                   flex items-center justify-center leading-none cursor-default
                   hover:bg-gray-500 focus:outline-none"
        aria-label="Info"
      >
        ?
      </button>
      {visible && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50
                     w-56 rounded bg-gray-900 text-white text-xs px-2 py-1.5
                     shadow-lg whitespace-normal pointer-events-none"
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
