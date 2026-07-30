import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { translateBatch } from "@/lib/auto-translate.functions";

/**
 * DOM-walking auto-translator.
 * When the app language is not Korean, walks the DOM, finds text nodes with
 * Korean characters, translates them via the Lovable AI Gateway (cached in
 * `ui_translations`), and swaps the text in place. Watches for future DOM
 * changes so newly added UI (from any feature) is translated automatically.
 *
 * Notes:
 *  - Only runs when language !== "ko".
 *  - Skips <script>, <style>, contenteditable regions, and inputs.
 *  - Skips nodes marked with `data-no-translate` or inside such an ancestor.
 *  - Original text is preserved on the DOM node (`__origText`) so switching
 *    back to Korean restores instantly.
 */
export function AutoTranslator() {
  const { i18n } = useTranslation();
  const translate = useServerFn(translateBatch);

  const cacheRef = useRef<Map<string, Map<string, string>>>(new Map()); // lang -> (src -> translated)
  const observerRef = useRef<MutationObserver | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesBySrcRef = useRef<Map<string, Set<Text>>>(new Map());

  useEffect(() => {
    const lang = i18n.language;

    // Stop any previous observer
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;

    if (typeof window === "undefined" || typeof document === "undefined") return;

    if (lang === "ko") {
      // Restore original Korean text on any translated node
      restoreOriginals(document.body);
      return;
    }

    if (!cacheRef.current.has(lang)) cacheRef.current.set(lang, new Map());
    const cache = cacheRef.current.get(lang)!;

    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(async () => {
        flushTimerRef.current = null;
        const batch = Array.from(pendingRef.current);
        pendingRef.current.clear();
        if (batch.length === 0) return;
        try {
          const map = await translate({ data: { texts: batch, targetLang: lang as "en" | "ko" } });
          for (const [src, translated] of Object.entries(map)) {
            cache.set(src, translated);
            const nodes = nodesBySrcRef.current.get(src);
            if (!nodes) continue;
            for (const node of nodes) {
              if (!node.isConnected) continue;
              applyTranslation(node, translated);
            }
            nodesBySrcRef.current.delete(src);
          }
        } catch (err) {
          console.error("[AutoTranslator] batch failed", err);
        }
      }, 200);
    };

    const enqueue = (node: Text, src: string) => {
      const cached = cache.get(src);
      if (cached !== undefined) {
        applyTranslation(node, cached);
        return;
      }
      let set = nodesBySrcRef.current.get(src);
      if (!set) {
        set = new Set();
        nodesBySrcRef.current.set(src, set);
      }
      set.add(node);
      pendingRef.current.add(src);
      scheduleFlush();
    };

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const raw = textNode.nodeValue;
        if (!raw) return;
        const trimmed = raw.trim();
        if (!trimmed) return;
        if (!KOREAN_RE.test(trimmed)) return;
        if (isSkipped(textNode.parentElement)) return;
        // Preserve original once
        const anyNode = textNode as Text & { __origText?: string };
        if (anyNode.__origText === undefined) anyNode.__origText = raw;
        enqueue(textNode, trimmed);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (isSkipped(el)) return;
        // Walk descendants
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => {
            const t = (n.nodeValue ?? "").trim();
            if (!t || !KOREAN_RE.test(t)) return NodeFilter.FILTER_REJECT;
            if (isSkipped((n as Text).parentElement)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        });
        let cur = walker.nextNode();
        while (cur) {
          const textNode = cur as Text;
          const anyNode = textNode as Text & { __origText?: string };
          const raw = textNode.nodeValue ?? "";
          if (anyNode.__origText === undefined) anyNode.__origText = raw;
          enqueue(textNode, raw.trim());
          cur = walker.nextNode();
        }
      }
    };

    // Initial pass
    processNode(document.body);

    // Observe future mutations — queued and processed during idle time so
    // chat-heavy screens (e.g. Telegram) never block the main thread.
    const queue: Node[] = [];
    let idleHandle: number | null = null;
    const idle: (cb: () => void) => number =
      (window as any).requestIdleCallback
        ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 500 })
        : (cb) => window.setTimeout(cb, 100);
    const cancelIdle: (h: number) => void =
      (window as any).cancelIdleCallback
        ? (h) => (window as any).cancelIdleCallback(h)
        : (h) => window.clearTimeout(h);

    const drain = () => {
      idleHandle = null;
      const start = performance.now();
      while (queue.length > 0 && performance.now() - start < 8) {
        const node = queue.shift()!;
        if (!node.isConnected) continue;
        processNode(node);
      }
      if (queue.length > 0) idleHandle = idle(drain);
    };

    const schedule = () => {
      if (idleHandle === null) idleHandle = idle(drain);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === Node.ELEMENT_NODE && isSkipped(n as Element)) return;
            queue.push(n);
          });
        } else if (m.type === "characterData") {
          queue.push(m.target);
        }
      }
      // Guard against runaway growth on very chatty screens
      if (queue.length > 2000) queue.splice(0, queue.length - 2000);
      if (queue.length > 0) schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      queue.length = 0;
      if (idleHandle !== null) cancelIdle(idleHandle);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    };
  }, [i18n.language, translate]);


  return null;
}

const KOREAN_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

function isSkipped(el: Element | null): boolean {
  if (!el) return true;
  const tag = el.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "CODE" || tag === "PRE") return true;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") return true;
  if (el.closest("[data-no-translate]")) return true;
  const editable = (el as HTMLElement).isContentEditable;
  if (editable) return true;
  return false;
}

function applyTranslation(node: Text, translated: string) {
  const raw = node.nodeValue ?? "";
  // Preserve leading/trailing whitespace of original
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  node.nodeValue = `${leading}${translated}${trailing}`;
}

function restoreOriginals(root: Node) {
  if (typeof document === "undefined") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cur = walker.nextNode();
  while (cur) {
    const n = cur as Text & { __origText?: string };
    if (n.__origText !== undefined && n.nodeValue !== n.__origText) {
      n.nodeValue = n.__origText;
    }
    cur = walker.nextNode();
  }
}
