import React from 'react';
import { Power, ShieldAlert, Cpu, Sparkles } from 'lucide-react';

export function HolographicPanel({ 
  children, 
  className = '', 
  title, 
  glow = false,
  scanline = false
}: { 
  children: React.ReactNode; 
  className?: string;
  title?: string;
  glow?: boolean;
  scanline?: boolean;
}) {
  return (
    <div className={`holo-panel ${className} ${glow ? 'shadow-[0_0_30px_hsla(185,100%,50%,0.15)] border-primary/40' : ''}`}>
      <div className="holo-corner-tr" />
      <div className="holo-corner-bl" />
      {scanline && <div className="scanline-overlay" />}
      
      {title && (
        <div className="border-b border-primary/20 px-5 py-3 flex items-center gap-3 bg-primary/5">
          <div className="w-1.5 h-1.5 bg-primary shadow-[0_0_5px_hsl(var(--primary))]"></div>
          <span className="tech-label m-0 text-primary">{title}</span>
        </div>
      )}
      <div className={title ? 'p-5' : ''}>
        {children}
      </div>
    </div>
  );
}

export function StatusDot({ 
  status = 'online', 
  pulse = false 
}: { 
  status?: 'online' | 'amber' | 'red' | 'offline';
  pulse?: boolean;
}) {
  return (
    <div className={`status-indicator`}>
      <span className={`status-dot ${status === 'online' ? '' : status} ${pulse ? 'pulse' : ''}`} />
      <span className={status === 'red' ? 'text-red' : status === 'amber' ? 'text-amber' : status === 'offline' ? 'text-muted' : 'text-cyan'}>
        {status === 'online' ? 'LIVE' : status === 'amber' ? 'WARN' : status === 'red' ? 'CRIT' : 'OFF'}
      </span>
    </div>
  );
}

export function TechLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`tech-label ${className}`}>{children}</div>;
}

export function TechValue({ children, size = 'md', className = '' }: { children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <div className={`tech-value tech-value-${size} ${className}`}>{children}</div>;
}

export function JARVISCore({ isThinking = false, onClick, processText }: { isThinking?: boolean; onClick?: () => void; processText?: string }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper 
      onClick={onClick} 
      className={`relative flex flex-col items-center justify-center group ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="relative flex items-center justify-center w-32 h-32 md:w-48 md:h-48 shrink-0">
        {/* Outer Ring */}
        <div className={`absolute inset-0 rounded-full border border-primary/20 border-t-primary/60 border-l-primary/60 ${isThinking ? 'animate-[spin-slow_2s_linear_infinite]' : 'animate-[spin-slow_10s_linear_infinite]'}`} />
        
        {/* Middle Ring */}
        <div className={`absolute inset-4 rounded-full border border-primary/10 border-b-primary/50 border-r-primary/50 ${isThinking ? 'animate-[spin-slow-reverse_3s_linear_infinite]' : 'animate-[spin-slow-reverse_15s_linear_infinite]'}`} />
        
        {/* Inner Core */}
        <div className={`absolute inset-10 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/30 flex items-center justify-center shadow-[0_0_30px_hsla(185,100%,50%,0.2)] ${isThinking ? 'animate-[pulse-ring_1.5s_ease-in-out_infinite]' : 'animate-[pulse-ring_4s_ease-in-out_infinite]'} ${onClick ? 'group-hover:bg-primary/20 transition-colors' : ''}`}>
          <Sparkles className={`w-8 h-8 md:w-12 md:h-12 text-primary ${isThinking ? 'opacity-100' : 'opacity-60'}`} />
        </div>
      </div>
      {processText && (
        <div className={`mt-4 font-mono text-[10px] uppercase tracking-widest text-primary/70 ${isThinking ? 'animate-pulse' : ''}`}>
          {processText}
        </div>
      )}
    </Wrapper>
  );
}

export function ExecutionMode({ mode }: { mode: 'OBSERVE' | 'EXECUTE' | 'DEGRADED' | 'RESEARCH' | 'APPROVAL' | 'AGENTIC' }) {
  const color = (mode === 'OBSERVE' || mode === 'RESEARCH') ? 'text-cyan' : mode === 'EXECUTE' ? 'text-red' : 'text-amber';
  const border = (mode === 'OBSERVE' || mode === 'RESEARCH') ? 'border-primary/30' : mode === 'EXECUTE' ? 'border-red-500/30' : 'border-amber-500/30';
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 border ${border} bg-black/40 backdrop-blur-md`}>
      <Cpu size={14} className={color} />
      <span className={`font-mono text-[10px] tracking-widest ${color}`}>{mode} MODE</span>
    </div>
  );
}

export function KillSwitch({ engaged = false, onToggle, label, readOnly }: { engaged?: boolean; onToggle?: () => void; label?: string; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button 
        onClick={readOnly ? undefined : onToggle}
        disabled={readOnly}
        className={`relative overflow-hidden group flex items-center justify-center w-12 h-12 border ${engaged ? 'border-red-500 bg-red-500/10' : 'border-primary/30 bg-primary/5'} ${readOnly ? 'opacity-50 cursor-not-allowed' : 'transition-colors'}`}
        title="SYSTEM KILL SWITCH"
      >
        {engaged ? <ShieldAlert className="text-red-500 w-5 h-5 animate-pulse" /> : <Power className="text-primary w-5 h-5 opacity-70 group-hover:opacity-100" />}
        {!readOnly && <div className="absolute inset-0 bg-gradient-to-t from-red-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />}
      </button>
      {label && <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase max-w-[120px] leading-tight">{label}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  onClick,
  testId,
  type = 'button',
  disabled = false,
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'solid' | 'danger' | 'icon';
  onClick?: () => void;
  testId: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  if (variant === 'icon') {
    return (
      <button className={`icon-btn ${className}`} data-testid={testId} onClick={onClick} type={type} disabled={disabled}>
        {children}
      </button>
    );
  }
  return (
    <button className={`btn-tech ${variant === 'solid' ? 'solid' : variant === 'danger' ? 'danger' : ''} ${className}`} data-testid={testId} onClick={onClick} type={type} disabled={disabled}>
      {children}
    </button>
  );
}
