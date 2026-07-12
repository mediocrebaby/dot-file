import { create } from "zustand";
import { DEFAULT_MODEL_CONFIG } from "../types/app";
import type {
  DocumentHistory,
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  OutputPreview,
  RoundProgress,
  RoundResult,
} from "../types/app";

export type ActivePreview = {
  label: string;
  round: number;
  revisionNumber: number | null;
  outputPath: string;
  manifestPath: string;
  kind: "round" | "revision" | "current-result";
  sourceRound: number;
  preview: OutputPreview;
};

type AppState = {
  modelConfig: ModelConfig;
  documentStatus: DocumentStatus | null;
  history: DocumentHistory | null;
  historyItems: HistoryDocumentSummary[];
  historyPanelOpen: boolean;
  roundResult: RoundResult | null;
  progress: RoundProgress | null;
  previewText: string;
  activePreview: ActivePreview | null;
  selectedParagraphIndexes: number[];
  runtimeStep: string;
  notice: string;
  busy: boolean;
  error: string;
  setModelConfig: (config: ModelConfig) => void;
  setDocumentStatus: (status: DocumentStatus | null) => void;
  setHistory: (history: DocumentHistory | null) => void;
  setHistoryItems: (items: HistoryDocumentSummary[]) => void;
  setHistoryPanelOpen: (open: boolean) => void;
  setRoundResult: (result: RoundResult | null) => void;
  setProgress: (progress: RoundProgress | null) => void;
  setPreviewText: (text: string) => void;
  setActivePreview: (preview: ActivePreview | null) => void;
  setSelectedParagraphIndexes: (indexes: number[]) => void;
  setRuntimeStep: (text: string) => void;
  setNotice: (notice: string) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
};

export const useAppState = create<AppState>((set) => ({
  modelConfig: DEFAULT_MODEL_CONFIG,
  documentStatus: null,
  history: null,
  historyItems: [],
  historyPanelOpen: false,
  roundResult: null,
  progress: null,
  previewText: "",
  activePreview: null,
  selectedParagraphIndexes: [],
  runtimeStep: "待命",
  notice: "",
  busy: false,
  error: "",
  setModelConfig: (modelConfig) => set({ modelConfig }),
  setDocumentStatus: (documentStatus) => set({ documentStatus }),
  setHistory: (history) => set({ history }),
  setHistoryItems: (historyItems) => set({ historyItems }),
  setHistoryPanelOpen: (historyPanelOpen) => set({ historyPanelOpen }),
  setRoundResult: (roundResult) => set({ roundResult }),
  setProgress: (progress) => set({ progress }),
  setPreviewText: (previewText) => set({ previewText }),
  setActivePreview: (activePreview) => set({ activePreview }),
  setSelectedParagraphIndexes: (selectedParagraphIndexes) => set({ selectedParagraphIndexes }),
  setRuntimeStep: (runtimeStep) => set({ runtimeStep }),
  setNotice: (notice) => set({ notice }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));
