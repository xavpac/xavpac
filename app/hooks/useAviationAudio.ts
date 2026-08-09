"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserStorage, safeGetItem, safeSetItem, XAVPAC_STORAGE_KEYS } from "../lib/safeStorage";

const SOUND_PREFERENCE_KEY = XAVPAC_STORAGE_KEYS.soundPreference;

type WebkitWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function audioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext ?? null;
}

function playConfirmation(context: AudioContext) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, now);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.04, now + .02);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .18);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + .19);
}

export function useAviationAudio() {
  const contextRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const stored = safeGetItem(getBrowserStorage("local"), SOUND_PREFERENCE_KEY);
    if (stored !== null) setEnabled(stored !== "off");
    return () => { void contextRef.current?.close(); };
  }, []);

  const unlock = useCallback(async (force = false) => {
    if (!enabled && !force) return false;
    const Constructor = audioContextConstructor();
    if (!Constructor) return false;
    contextRef.current ??= new Constructor();
    if (contextRef.current.state === "suspended") {
      try { await contextRef.current.resume(); } catch { return false; }
    }
    return contextRef.current.state === "running";
  }, [enabled]);

  const setSoundEnabled = useCallback(async (next: boolean) => {
    setEnabled(next);
    safeSetItem(getBrowserStorage("local"), SOUND_PREFERENCE_KEY, next ? "on" : "off");
    if (next && await unlock(true) && contextRef.current) playConfirmation(contextRef.current);
  }, [unlock]);

  const quietAircraftChange = useCallback(() => {
    const context = contextRef.current;
    if (!enabled || !context || context.state !== "running") return false;
    const now = context.currentTime;
    [0, .095].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(index === 0 ? 620 : 820, now + offset);
      gain.gain.setValueAtTime(.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(.045, now + offset + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + .17);
    });
    return true;
  }, [enabled]);

  const nationalAssetAlert = useCallback(() => {
    const context = contextRef.current;
    if (!enabled || !context || context.state !== "running") return false;
    const now = context.currentTime;
    [0, .28, .56].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(index % 2 === 0 ? 880 : 690, now + offset);
      gain.gain.setValueAtTime(.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(.11, now + offset + .025);
      gain.gain.setValueAtTime(.11, now + offset + .13);
      gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .23);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + .24);
    });
    return true;
  }, [enabled]);

  return { enabled, setSoundEnabled, unlock, quietAircraftChange, nationalAssetAlert };
}
