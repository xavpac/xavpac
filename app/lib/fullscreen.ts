type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type FullscreenMode = "native" | "css";

export function isFullscreenActive(documentValue: Document | null = typeof document === "undefined" ? null : document) {
  if (!documentValue) return false;
  const compatible = documentValue as WebkitFullscreenDocument;
  return Boolean(documentValue.fullscreenElement || compatible.webkitFullscreenElement);
}

export async function enterFullscreenIfAvailable(element: HTMLElement | null): Promise<FullscreenMode> {
  if (!element) return "css";
  try {
    if (typeof element.requestFullscreen === "function") {
      await element.requestFullscreen();
      return "native";
    }
    const compatible = element as WebkitFullscreenElement;
    if (typeof compatible.webkitRequestFullscreen === "function") {
      await compatible.webkitRequestFullscreen();
      return "native";
    }
  } catch {
    return "css";
  }
  return "css";
}

export async function exitFullscreenIfActive(documentValue: Document | null = typeof document === "undefined" ? null : document) {
  if (!documentValue || !isFullscreenActive(documentValue)) return false;
  try {
    if (typeof documentValue.exitFullscreen === "function") await documentValue.exitFullscreen();
    else {
      const compatible = documentValue as WebkitFullscreenDocument;
      await compatible.webkitExitFullscreen?.();
    }
    return true;
  } catch {
    return false;
  }
}
