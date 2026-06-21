export {
  highlight,
  preloadLanguage,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type Lang,
  type Span,
} from "./engine";
export { loadQuerySource, luaPatternToRegex } from "./queryLoader";
export { buildSpans, type RawCapture } from "./spans";
