"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserStorage, safeGetItem, safeSetItem, XAVPAC_STORAGE_KEYS } from "../lib/safeStorage";
import {
  AIRCRAFT_CHANGE_SIGNATURE,
  NATIONAL_ASSET_SIGNATURE,
  type AviationSoundTone
} from "../lib/aviation/audioSignatures";

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

function playSignature(context: AudioContext, signature: readonly AviationSoundTone[]) {
  const now = context.currentTime + .01;
  for (const tone of signature) {
    const start = now + tone.offsetSeconds;
    const end = start + tone.durationSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.frequencyHz, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.peakGain, start + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, end);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + .02);
  }
}

export function useAviationAudio() {
  const contextRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

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
    const running = contextRef.current.state === "running";
    setReady(running);
    return running;
  }, [enabled]);

  const setSoundEnabled = useCallback(async (next: boolean) => {
    setEnabled(next);
    if (!next) setReady(false);
    safeSetItem(getBrowserStorage("local"), SOUND_PREFERENCE_KEY, next ? "on" : "off");
    if (next && await unlock(true) && contextRef.current) playConfirmation(contextRef.current);
  }, [unlock]);

  const quietAircraftChange = useCallback(() => {
    const context = contextRef.current;
    if (!enabled || !context || context.state !== "running") return false;
    playSignature(context, AIRCRAFT_CHANGE_SIGNATURE);
    return true;
  }, [enabled]);

  const nationalAssetAlert = useCallback(() => {
    const context = contextRef.current;
    if (!enabled || !context || context.state !== "running") return false;
    playSignature(context, NATIONAL_ASSET_SIGNATURE);
    return true;
  }, [enabled]);

  const previewAircraftChange = useCallback(async () => {
    if (!enabled || !await unlock()) return false;
    const context = contextRef.current;
    if (!context) return false;
    playSignature(context, AIRCRAFT_CHANGE_SIGNATURE);
    return true;
  }, [enabled, unlock]);

  const previewNationalAsset = useCallback(async () => {
    if (!enabled || !await unlock()) return false;
    const context = contextRef.current;
    if (!context) return false;
    playSignature(context, NATIONAL_ASSET_SIGNATURE);
    return true;
  }, [enabled, unlock]);

  return { enabled, ready, setSoundEnabled, unlock, quietAircraftChange, nationalAssetAlert, previewAircraftChange, previewNationalAsset };
}
