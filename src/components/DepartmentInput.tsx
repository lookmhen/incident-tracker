'use client';

import React, { useEffect, useMemo, useState } from 'react';

interface DepartmentInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
}

export default function DepartmentInput({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
}: DepartmentInputProps) {
  const [departments, setDepartments] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    let alive = true;
    fetch('/api/departments', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (alive && Array.isArray(data)) {
          setDepartments(data.filter((d): d is string => typeof d === 'string'));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return departments.slice(0, 8);
    const starts: string[] = [];
    const contains: string[] = [];
    for (const dept of departments) {
      const lower = dept.toLowerCase();
      if (lower === q) continue;
      if (lower.startsWith(q)) starts.push(dept);
      else if (lower.includes(q)) contains.push(dept);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [departments, value]);

  const handleSelect = (dept: string) => {
    onChange(dept);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        value={value}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(-1);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={(e) => {
          if (open && matches.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((prev) => (prev + 1) % matches.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((prev) => (prev <= 0 ? matches.length - 1 : prev - 1));
              return;
            }
            if (e.key === 'Enter' && activeIndex >= 0 && matches[activeIndex]) {
              e.preventDefault();
              handleSelect(matches[activeIndex]);
              return;
            }
            if (e.key === 'Escape') {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        placeholder={placeholder}
        className={className}
      />
      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-40 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((dept, idx) => (
            <li key={dept} role="option" aria-selected={idx === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(dept);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                  idx === activeIndex
                    ? 'bg-sky-50 text-sky-800 font-semibold'
                    : 'text-slate-700 hover:bg-sky-50/70'
                }`}
              >
                <span className="material-symbols-outlined text-[14px] text-sky-500 shrink-0">
                  corporate_fare
                </span>
                <span className="truncate">{dept}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
