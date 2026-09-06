"use client";
import { useEffect, useRef } from 'react';
import { mountPhoneEditor, type PhoneEditorAdapter } from './core/phone-editor';
import './phone.css';

export default function CoverPhoneEditor({ adapter }: { adapter: PhoneEditorAdapter }) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef(adapter);
  const controller = useRef<ReturnType<typeof mountPhoneEditor> | null>(null);
  useEffect(() => { latest.current = adapter; controller.current?.update(); });
  useEffect(() => {
    controller.current = mountPhoneEditor(root.current!, () => latest.current);
    return () => { controller.current?.destroy(); controller.current = null; };
  }, []);
  return <div ref={root} className="phone-root" />;
}
