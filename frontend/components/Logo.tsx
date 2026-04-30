import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex items-center justify-center w-12 h-12">
        {/* Glowing background */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[var(--pp-blue)] to-[#00f2fe] rounded-xl blur-md opacity-50"></div>
        {/* Main logo mark */}
        <div className="relative w-full h-full bg-gradient-to-br from-[var(--pp-navy)] to-[var(--pp-blue)] rounded-xl shadow-lg border border-white/20 flex items-center justify-center overflow-hidden">
          {/* Decorative swoosh for Jupiter planet vibe */}
          <svg className="absolute w-[150%] h-[150%] -top-4 -left-4 text-white/10" viewBox="0 0 100 100">
            <ellipse cx="50" cy="50" rx="40" ry="15" transform="rotate(-30 50 50)" fill="none" stroke="currentColor" strokeWidth="2" />
            <ellipse cx="50" cy="50" rx="45" ry="20" transform="rotate(-30 50 50)" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <span className="text-white font-black text-2xl tracking-tighter z-10" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>
            J
          </span>
        </div>
      </div>
      <span className="font-extrabold text-2xl text-transparent bg-clip-text bg-gradient-to-r from-[var(--pp-navy)] to-[var(--pp-blue)] tracking-tight">
        Jupiter
      </span>
    </div>
  );
};
