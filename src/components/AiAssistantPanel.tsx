import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  X,
  Send,
  BookOpen,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Trash2,
  GitBranch,
  ChevronDown,
  Cpu,
  UserCog,
  SlidersHorizontal,
} from "lucide-react";
import { ReadingTheme, ChatNode, AiModelId } from "../types";
import {
  loadSavedPersonality,
  StoredPersonalityConfig,
} from "../lib/personalityPresets";
import { AiPersonalityModal } from "./AiPersonalityModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { ChatMessageContent } from "./ChatMessageContent";
import { getGeminiHeaders, loadGeminiSettings } from "../lib/geminiSettings";
import { getApiBaseUrl } from "../lib/apiConfig";
import { summarizeDocumentPage, askGeminiDocument } from "../lib/geminiApiBridge";

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  docTitle: string;
  currentPage: number;
  currentPageText: string;
  theme: ReadingTheme;
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

export interface ModelOption {
  id: AiModelId;
  name: string;
  badge: string;
  badgeColor: string;
  description: string;
  tagline: string;
}

export const AI_MODELS: ModelOption[] = [
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    badge: "Rekomendasi",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    description: "Model multimodal generasi terbaru yang cepat, cerdas, & efisien.",
    tagline: "Cepat & Cerdas",
  },
  {
    id: "gemini-3.1-flash",
    name: "Gemini 3.1 Flash",
    badge: "Kilat",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    description: "Latensi super rendah & hemat kuota untuk respons cepat.",
    tagline: "Latensi Rendah",
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    badge: "Pro",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    description: "Penalaran mendalam, analisis komprehensif, & logika kompleks.",
    tagline: "Penalaran Mendalam",
  },
];

function generateNodeId(): string {
  return "node_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

function formatModelName(modelId?: string): string {
  if (!modelId) return "Gemini 3.6 Flash";
  if (modelId.includes("3.6")) return "Gemini 3.6 Flash";
  if (modelId.includes("3.1-pro")) return "Gemini 3.1 Pro";
  if (modelId.includes("3.1")) return "Gemini 3.1 Flash";
  return "Gemini 3.6 Flash";
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  isOpen,
  onClose,
  docTitle,
  currentPage,
  currentPageText,
  theme,
  initialQuery,
  onClearInitialQuery,
}) => {
  const storageKey = `pdf_ai_tree_${docTitle || "default"}`;

  // Model Selection State
  const [selectedModel, setSelectedModel] = useState<AiModelId>(() => {
    try {
      const geminiSettings = loadGeminiSettings();
      if (geminiSettings.textModel) {
        return geminiSettings.textModel as AiModelId;
      }
      const saved = localStorage.getItem("pdf_ai_model_preference");
      if (saved && (saved === "gemini-3.6-flash" || saved === "gemini-3.1-flash" || saved === "gemini-3.1-pro")) {
        return saved as AiModelId;
      }
    } catch (e) {
      console.warn("Could not load model preference:", e);
    }
    return "gemini-3.6-flash";
  });

  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  // AI Personality Configuration State
  const [personalityConfig, setPersonalityConfig] = useState<StoredPersonalityConfig>(loadSavedPersonality);
  const [isPersonalityModalOpen, setIsPersonalityModalOpen] = useState(false);

  // In-app Delete Confirmation Dialog State (replaces iframe-blocked window.confirm)
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    type: "clear_all" | "single_node";
    node?: ChatNode;
    title: string;
    description: string;
    dangerLevel: "normal" | "all";
  }>({
    isOpen: false,
    type: "clear_all",
    title: "",
    description: "",
    dangerLevel: "normal",
  });

  // Tree nodes indexed by unique ID
  const [nodes, setNodes] = useState<Record<string, ChatNode>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.nodes && typeof parsed.nodes === "object") {
          return parsed.nodes;
        }
      }
    } catch (e) {
      console.warn("Could not load saved chat tree:", e);
    }
    return {};
  });

  // Active child pointers: parentId (or '__root__') -> active child ID
  const [activeChildMap, setActiveChildMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeChildMap && typeof parsed.activeChildMap === "object") {
          return parsed.activeChildMap;
        }
      }
    } catch (e) {
      console.warn("Could not load active child map:", e);
    }
    return {};
  });

  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [regeneratingNodeId, setRegeneratingNodeId] = useState<string | null>(null);

  // Edit states
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");

  // Copy feedback state
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  // Page Key Insights / Summary
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Synchronize initial query from selected PDF text snippet
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setInputQuery(initialQuery);
      onClearInitialQuery?.();
    }
  }, [initialQuery, onClearInitialQuery]);

  // Persist model preference to local storage
  useEffect(() => {
    try {
      localStorage.setItem("pdf_ai_model_preference", selectedModel);
    } catch (e) {
      console.warn("Failed to persist model preference:", e);
    }
  }, [selectedModel]);

  // Persist conversation tree to local storage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ nodes, activeChildMap }));
    } catch (e) {
      console.warn("Failed to persist chat tree to local storage:", e);
    }
  }, [nodes, activeChildMap, storageKey]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editingNodeId && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.setSelectionRange(
        editTextareaRef.current.value.length,
        editTextareaRef.current.value.length
      );
    }
  }, [editingNodeId]);

  // Tree Helper Functions
  const getChildren = (parentId: string | null): ChatNode[] => {
    return (Object.values(nodes) as ChatNode[])
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.createdAt - b.createdAt);
  };

  const getActiveChild = (parentId: string | null): ChatNode | null => {
    const children = getChildren(parentId);
    if (children.length === 0) return null;
    const key = parentId ?? "__root__";
    const activeId = activeChildMap[key];
    if (activeId) {
      const found = children.find((c) => c.id === activeId);
      if (found) return found;
    }
    // Default to newest child
    return children[children.length - 1];
  };

  const getCurrentThread = (): ChatNode[] => {
    const thread: ChatNode[] = [];
    let curr = getActiveChild(null);
    while (curr) {
      thread.push(curr);
      curr = getActiveChild(curr.id);
    }
    return thread;
  };

  // Find all sibling variants of a node (same parent, same role)
  const getSiblingVariants = (node: ChatNode): ChatNode[] => {
    return (Object.values(nodes) as ChatNode[])
      .filter((n) => n.parentId === node.parentId && n.role === node.role)
      .sort((a, b) => a.createdAt - b.createdAt);
  };

  // Switch active branch for a given node
  const handleSelectSibling = (node: ChatNode, targetSiblingId: string) => {
    const parentKey = node.parentId ?? "__root__";
    setActiveChildMap((prev) => ({
      ...prev,
      [parentKey]: targetSiblingId,
    }));
  };

  const thread = getCurrentThread();
  const currentModelOption = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];

  // Scroll to bottom when thread updates
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread.length, thread.map((t) => t.id).join(","), isOpen]);

  if (!isOpen) return null;

  // Trigger Clear entire chat tree confirmation modal
  const handleClearChat = () => {
    if (Object.keys(nodes).length === 0) return;
    setDeleteConfirmState({
      isOpen: true,
      type: "clear_all",
      title: "Clear Chat & Mulai Percakapan Baru",
      description:
        "Apakah Anda yakin ingin menghapus semua riwayat percakapan pada dokumen/halaman ini? Riwayat obrolan dan cabang jawaban akan di-reset.",
      dangerLevel: "all",
    });
  };

  // Trigger Delete single chat node confirmation modal
  const handleDeleteNode = (nodeToDelete: ChatNode) => {
    const isUser = nodeToDelete.role === "user";
    setDeleteConfirmState({
      isOpen: true,
      type: "single_node",
      node: nodeToDelete,
      title: isUser ? "Hapus Pertanyaan" : "Hapus Jawaban AI",
      description: isUser
        ? "Hapus balon pertanyaan ini beserta jawaban respons AI di bawahnya?"
        : "Hapus balon jawaban respons AI ini dari riwayat obrolan?",
      dangerLevel: "normal",
    });
  };

  // Execute confirmed deletion action
  const handleExecuteConfirmedDelete = () => {
    if (deleteConfirmState.type === "clear_all") {
      setNodes({});
      setActiveChildMap({});
      setEditingNodeId(null);
      setEditingText("");
      setInputQuery("");
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        console.warn("Could not remove saved chat tree:", e);
      }
      return;
    }

    if (deleteConfirmState.type === "single_node" && deleteConfirmState.node) {
      const nodeToDelete = deleteConfirmState.node;
      if (editingNodeId === nodeToDelete.id) {
        setEditingNodeId(null);
        setEditingText("");
      }

      // Collect target node and all its descendants recursively
      const toDelete = new Set<string>();
      const collectDescendants = (id: string) => {
        toDelete.add(id);
        for (const n of Object.values(nodes) as ChatNode[]) {
          if (n.parentId === id && !toDelete.has(n.id)) {
            collectDescendants(n.id);
          }
        }
      };
      collectDescendants(nodeToDelete.id);

      const updatedNodes: Record<string, ChatNode> = {};
      for (const id of Object.keys(nodes)) {
        if (!toDelete.has(id) && nodes[id]) {
          updatedNodes[id] = nodes[id];
        }
      }

      const updatedActiveChildMap = { ...activeChildMap };
      for (const delId of toDelete) {
        delete updatedActiveChildMap[delId];
      }

      const parentKey = nodeToDelete.parentId ?? "__root__";
      if (updatedActiveChildMap[parentKey] && toDelete.has(updatedActiveChildMap[parentKey])) {
        const remainingSiblings = (Object.values(updatedNodes) as ChatNode[])
          .filter((n) => n.parentId === nodeToDelete.parentId)
          .sort((a, b) => a.createdAt - b.createdAt);

        if (remainingSiblings.length > 0) {
          updatedActiveChildMap[parentKey] = remainingSiblings[remainingSiblings.length - 1].id;
        } else {
          delete updatedActiveChildMap[parentKey];
        }
      }

      setNodes(updatedNodes);
      setActiveChildMap(updatedActiveChildMap);
    }
  };

  // Copy to clipboard
  const handleCopy = (nodeId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedNodeId(nodeId);
    setTimeout(() => {
      setCopiedNodeId(null);
    }, 2000);
  };

  // Generate Page Summary using the selected model
  const handleGenerateSummary = async () => {
    if (!currentPageText.trim()) return;
    setIsSummarizing(true);
    try {
      const data = await summarizeDocumentPage({
        pageText: currentPageText,
        pageNumber: currentPage,
        docTitle,
        model: selectedModel,
        personality: personalityConfig.systemPrompt,
      });
      if (data.summary) {
        setSummaryText(data.summary);
      } else {
        setSummaryText("Gagal menghasilkan rangkuman.");
      }
    } catch (e: any) {
      setSummaryText(`Gagal: ${e?.message || "Periksa koneksi internet Anda."}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Send a new message from bottom input bar
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputQuery.trim();
    if (!q || isLoading) return;

    const currentLeaf = thread.length > 0 ? thread[thread.length - 1] : null;
    const parentId = currentLeaf ? currentLeaf.id : null;

    const newUserNode: ChatNode = {
      id: generateNodeId(),
      parentId,
      role: "user",
      content: q,
      createdAt: Date.now(),
    };

    const newNodes = { ...nodes, [newUserNode.id]: newUserNode };
    const newActiveChildMap = {
      ...activeChildMap,
      [parentId ?? "__root__"]: newUserNode.id,
    };

    setNodes(newNodes);
    setActiveChildMap(newActiveChildMap);
    setInputQuery("");
    setIsLoading(true);

    // Prepare previous history leading to this question
    const history = thread.map((n) => ({ role: n.role, content: n.content }));

    try {
      const data = await askGeminiDocument({
        question: q,
        history,
        pageText: currentPageText,
        docTitle,
        pageNumber: currentPage,
        model: selectedModel,
        personality: personalityConfig.systemPrompt,
      });
      const answer = data.answer || "Tidak ada respons diterima.";

      const newAiNode: ChatNode = {
        id: generateNodeId(),
        parentId: newUserNode.id,
        role: "assistant",
        content: answer,
        createdAt: Date.now(),
        model: selectedModel,
      };

      setNodes((prev) => ({ ...prev, [newAiNode.id]: newAiNode }));
      setActiveChildMap((prev) => ({ ...prev, [newUserNode.id]: newAiNode.id }));
    } catch (err: any) {
      const errAiNode: ChatNode = {
        id: generateNodeId(),
        parentId: newUserNode.id,
        role: "assistant",
        content: `Error: ${err?.message || "Tidak dapat menghubungi layanan Gemini AI."}`,
        createdAt: Date.now(),
        model: selectedModel,
      };
      setNodes((prev) => ({ ...prev, [errAiNode.id]: errAiNode }));
      setActiveChildMap((prev) => ({ ...prev, [newUserNode.id]: errAiNode.id }));
    } finally {
      setIsLoading(false);
    }
  };

  // Submit edited User message -> triggers a NEW conversation branch
  const handleSaveUserEdit = async (userNode: ChatNode) => {
    const newText = editingText.trim();
    if (!newText || isLoading) return;

    if (newText === userNode.content) {
      setEditingNodeId(null);
      return;
    }

    // Create a new user node sharing the same parentId (new branch sibling!)
    const newUserVariantNode: ChatNode = {
      id: generateNodeId(),
      parentId: userNode.parentId,
      role: "user",
      content: newText,
      createdAt: Date.now(),
    };

    const newNodes = { ...nodes, [newUserVariantNode.id]: newUserVariantNode };
    const parentKey = userNode.parentId ?? "__root__";
    const newActiveChildMap = {
      ...activeChildMap,
      [parentKey]: newUserVariantNode.id,
    };

    setNodes(newNodes);
    setActiveChildMap(newActiveChildMap);
    setEditingNodeId(null);
    setIsLoading(true);

    // Build history path up to parent
    const historyPath: ChatNode[] = [];
    let currId = userNode.parentId;
    while (currId) {
      const n = newNodes[currId];
      if (n) {
        historyPath.unshift(n);
        currId = n.parentId;
      } else {
        break;
      }
    }
    const history = historyPath.map((n) => ({ role: n.role, content: n.content }));

    try {
      const data = await askGeminiDocument({
        question: newText,
        history,
        pageText: currentPageText,
        docTitle,
        pageNumber: currentPage,
        model: selectedModel,
        personality: personalityConfig.systemPrompt,
      });
      const answer = data.answer || "Tidak ada respons diterima.";

      const newAiNode: ChatNode = {
        id: generateNodeId(),
        parentId: newUserVariantNode.id,
        role: "assistant",
        content: answer,
        createdAt: Date.now(),
        model: selectedModel,
      };

      setNodes((prev) => ({ ...prev, [newAiNode.id]: newAiNode }));
      setActiveChildMap((prev) => ({ ...prev, [newUserVariantNode.id]: newAiNode.id }));
    } catch (err: any) {
      const errAiNode: ChatNode = {
        id: generateNodeId(),
        parentId: newUserVariantNode.id,
        role: "assistant",
        content: `Error: ${err?.message || "Tidak dapat menghubungi layanan Gemini AI."}`,
        createdAt: Date.now(),
        model: selectedModel,
      };
      setNodes((prev) => ({ ...prev, [errAiNode.id]: errAiNode }));
      setActiveChildMap((prev) => ({ ...prev, [newUserVariantNode.id]: errAiNode.id }));
    } finally {
      setIsLoading(false);
    }
  };

  // Regenerate AI response -> creates a new response variant for the same user message
  const handleRegenerateAi = async (aiNode: ChatNode) => {
    if (isLoading || regeneratingNodeId) return;

    const userPromptNode = aiNode.parentId ? nodes[aiNode.parentId] : null;
    if (!userPromptNode) return;

    setRegeneratingNodeId(aiNode.id);
    setIsLoading(true);

    // Build history path up to parent of the user prompt
    const historyPath: ChatNode[] = [];
    let currId = userPromptNode.parentId;
    while (currId) {
      const n = nodes[currId];
      if (n) {
        historyPath.unshift(n);
        currId = n.parentId;
      } else {
        break;
      }
    }
    const history = historyPath.map((n) => ({ role: n.role, content: n.content }));

    try {
      const data = await askGeminiDocument({
        question: userPromptNode.content,
        history,
        pageText: currentPageText,
        docTitle,
        pageNumber: currentPage,
        model: selectedModel,
        personality: personalityConfig.systemPrompt,
      });
      const answer = data.answer || "Tidak ada respons baru diterima.";

      // Create new AI sibling variant with same parent
      const newAiVariantNode: ChatNode = {
        id: generateNodeId(),
        parentId: userPromptNode.id,
        role: "assistant",
        content: answer,
        createdAt: Date.now(),
        model: selectedModel,
      };

      setNodes((prev) => ({ ...prev, [newAiVariantNode.id]: newAiVariantNode }));
      setActiveChildMap((prev) => ({ ...prev, [userPromptNode.id]: newAiVariantNode.id }));
    } catch (err) {
      // Failed to regenerate
    } finally {
      setRegeneratingNodeId(null);
      setIsLoading(false);
    }
  };

  // Save edited AI response as a NEW branch variant (allows navigating between Response A and B)
  const handleSaveAiEditNewBranch = (aiNode: ChatNode) => {
    const newText = editingText.trim();
    if (!newText) return;

    if (newText === aiNode.content) {
      setEditingNodeId(null);
      return;
    }

    const newAiVariantNode: ChatNode = {
      id: generateNodeId(),
      parentId: aiNode.parentId,
      role: "assistant",
      content: newText,
      createdAt: Date.now(),
      model: aiNode.model || selectedModel,
    };

    setNodes((prev) => ({ ...prev, [newAiVariantNode.id]: newAiVariantNode }));
    if (aiNode.parentId) {
      setActiveChildMap((prev) => ({ ...prev, [aiNode.parentId!]: newAiVariantNode.id }));
    }
    setEditingNodeId(null);
  };

  // Save edited AI response in-place (updating current node directly)
  const handleSaveAiEditInPlace = (aiNode: ChatNode) => {
    const newText = editingText.trim();
    if (!newText) return;

    setNodes((prev) => ({
      ...prev,
      [aiNode.id]: {
        ...aiNode,
        content: newText,
      },
    }));
    setEditingNodeId(null);
  };

  const themeClasses = {
    light: "bg-white border-neutral-200 text-neutral-800",
    night: "bg-[#14171D] border-[#1F2937] text-[#E5E7EB]",
    sepia: "bg-[#f5ecda] border-[#ded3ba] text-[#4a3b2c]",
    midnight: "bg-[#0b1329] border-[#1e293b] text-slate-100",
  }[theme];

  return (
    <div
      id="ai-assistant-panel"
      className={`w-80 sm:w-96 border-l flex flex-col z-20 shrink-0 transition-colors shadow-2xl ${themeClasses}`}
      style={{ minHeight: 0 }}
    >
      {/* Header */}
      <div className="p-3 border-b border-[#1F2937] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            GEMINI ASSISTANT
          </span>
          {Object.keys(nodes).length > 0 && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono flex items-center gap-1"
              title="Cabang percakapan aktif"
            >
              <GitBranch className="w-2.5 h-2.5" />
              <span>Multi-Branch</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {Object.keys(nodes).length > 0 && (
            <button
              id="btn-clear-chat-header"
              type="button"
              onClick={handleClearChat}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 hover:border-red-400/50 text-[11px] font-medium text-red-300 hover:text-red-200 transition-all cursor-pointer shadow-xs"
              title="Hapus riwayat percakapan dan mulai baru"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
              <span>Clear Chat</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#1F2937] text-gray-400 hover:text-white cursor-pointer transition-colors"
            title="Tutup panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Model Selector Bar */}
      <div className="px-3 py-2 bg-[#10131A] border-b border-[#1F2937] flex items-center justify-between text-xs relative">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">
            Model:
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#161B24] hover:bg-[#1F2633] border border-[#283244] hover:border-blue-500/50 text-[11px] font-medium text-gray-200 transition-all cursor-pointer shadow-xs"
            title="Pilih model Gemini untuk percakapan"
          >
            <span className="font-semibold text-blue-300">{currentModelOption.name}</span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${currentModelOption.badgeColor}`}
            >
              {currentModelOption.badge}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                isModelMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu Modal */}
          {isModelMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsModelMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-76 bg-[#10131A] border border-[#283244] rounded-xl shadow-2xl z-40 p-2 space-y-1.5 text-left animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1 text-[10px] font-mono uppercase text-gray-400 font-bold border-b border-[#1F2937] flex items-center justify-between">
                  <span>PILIH MODEL PERCAKAPAN</span>
                  <span className="text-[9px] text-blue-400 font-normal">Gemini Engine</span>
                </div>
                {AI_MODELS.map((m) => {
                  const isSelected = m.id === selectedModel;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m.id);
                        setIsModelMenuOpen(false);
                      }}
                      className={`w-full p-2 rounded-lg flex items-start justify-between gap-2 text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-600/20 border border-blue-500/50 text-white shadow-xs"
                          : "hover:bg-[#1A2230] text-gray-300 border border-transparent"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-semibold text-xs ${
                              isSelected ? "text-blue-200" : "text-gray-100"
                            }`}
                          >
                            {m.name}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${m.badgeColor}`}
                          >
                            {m.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          {m.description}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI Personality Bar & Edit Personality Button */}
      <div className="px-3 py-1.5 bg-[#121620] border-b border-[#1F2937] flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <UserCog className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 shrink-0">
            Personality:
          </span>
          <span
            className="text-[11px] font-medium text-purple-300 truncate max-w-[125px] sm:max-w-[155px]"
            title={personalityConfig.customName || "Kustom"}
          >
            {personalityConfig.customName || "Kustom"}
          </span>
          {personalityConfig.isCustomManual && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30 shrink-0">
              Manual
            </span>
          )}
        </div>

        <button
          id="btn-edit-personality"
          type="button"
          onClick={() => setIsPersonalityModalOpen(true)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 hover:border-purple-400/50 text-[11px] font-medium text-purple-300 transition-all cursor-pointer shadow-xs"
          title="Edit personality AI secara manual sesuai keinginan Anda"
        >
          <SlidersHorizontal className="w-3 h-3 text-purple-300" />
          <span>Edit Personality</span>
        </button>
      </div>

      {/* Page Context Badge */}
      <div className="px-3 py-2 bg-[#0C0E12] border-b border-[#1F2937] flex items-center justify-between text-[11px]">
        <span className="text-gray-400 truncate max-w-[170px] font-mono text-[10px]">
          {docTitle || "DOKUMEN"} &bull; Hlm.{currentPage}
        </span>
        <button
          onClick={handleGenerateSummary}
          disabled={isSummarizing || !currentPageText.trim()}
          className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-[10px] flex items-center gap-1 transition-all cursor-pointer uppercase tracking-wider"
          title={`Rangkum halaman ${currentPage} dengan ${currentModelOption.name}`}
        >
          {isSummarizing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <BookOpen className="w-3 h-3" />
          )}
          Rangkum Halaman
        </button>
      </div>

      {/* Summary Box if generated */}
      {summaryText && (
        <div className="p-3 border-b border-blue-500/20 bg-blue-500/10 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-blue-400 text-[10px] font-mono uppercase tracking-wider">
              POIN PENTING HALAMAN {currentPage}
            </span>
            <button
              onClick={() => setSummaryText(null)}
              className="text-gray-400 hover:text-white cursor-pointer"
              title="Tutup rangkuman"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed whitespace-pre-line text-gray-200">
            {summaryText}
          </p>
        </div>
      )}

      {/* Chat Messages List */}
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-4">
        {thread.length === 0 ? (
          <div className="text-center py-8 text-gray-400 space-y-3">
            <MessageSquare className="w-8 h-8 mx-auto opacity-30 text-blue-400" />
            <p className="font-mono text-xs text-gray-300">TANYAKAN TENTANG HALAMAN INI</p>
            <p className="text-[11px] text-gray-500 max-w-xs mx-auto leading-relaxed">
              {currentModelOption.name} membaca Halaman {currentPage} untuk menjelaskan konsep,
              menerjemahkan, atau menjawab pertanyaan.
            </p>
            <div className="pt-2 flex flex-col gap-1.5 max-w-xs mx-auto">
              <button
                onClick={() =>
                  setInputQuery(`Jelaskan secara ringkas isi penting di halaman ${currentPage}`)
                }
                className="text-left px-2.5 py-1.5 rounded bg-[#0F1115] hover:bg-blue-900/30 border border-[#1F2937] hover:border-blue-500/40 text-[11px] text-gray-300 transition-colors cursor-pointer"
              >
                &bull; Jelaskan isi penting halaman ini
              </button>
              <button
                onClick={() =>
                  setInputQuery(`Buat 3 pertanyaan refleksi berdasarkan teks halaman ${currentPage}`)
                }
                className="text-left px-2.5 py-1.5 rounded bg-[#0F1115] hover:bg-blue-900/30 border border-[#1F2937] hover:border-blue-500/40 text-[11px] text-gray-300 transition-colors cursor-pointer"
              >
                &bull; Buat pertanyaan refleksi dari halaman ini
              </button>
            </div>
          </div>
        ) : (
          thread.map((node) => {
            const isUser = node.role === "user";
            const siblings = getSiblingVariants(node);
            const variantIndex = siblings.findIndex((s) => s.id === node.id);
            const totalVariants = siblings.length;
            const hasBranches = totalVariants > 1;
            const isEditing = editingNodeId === node.id;
            const isRegenerating = regeneratingNodeId === node.id;

            return (
              <div
                key={node.id}
                className={`flex flex-col group ${isUser ? "items-end" : "items-start"}`}
              >
                {/* Message Header (Label + Branch navigation + Quick actions) */}
                <div
                  className={`flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-gray-400 mb-1 px-1 ${
                    isUser ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <span className="font-semibold text-gray-500 flex items-center gap-1">
                    {!isUser && <Sparkles className="w-2.5 h-2.5 text-blue-400" />}
                    {isUser ? "ANDA" : "GEMINI"}
                  </span>

                  {/* Branch Navigator (< 1/2 >) if multiple variants exist */}
                  {hasBranches && (
                    <div
                      className="flex items-center gap-1 bg-black/40 border border-white/10 px-1.5 py-0.5 rounded text-[10px] text-gray-300 font-mono shadow-xs"
                      title={`Cabang ${variantIndex + 1} dari ${totalVariants}`}
                    >
                      <button
                        disabled={variantIndex <= 0}
                        onClick={() => handleSelectSibling(node, siblings[variantIndex - 1].id)}
                        className="p-0.5 rounded hover:bg-white/20 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                        title="Cabang sebelumnya"
                        aria-label="Cabang sebelumnya"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <span className="px-0.5 font-bold text-blue-300">
                        {variantIndex + 1}/{totalVariants}
                      </span>
                      <button
                        disabled={variantIndex >= totalVariants - 1}
                        onClick={() => handleSelectSibling(node, siblings[variantIndex + 1].id)}
                        className="p-0.5 rounded hover:bg-white/20 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                        title="Cabang berikutnya"
                        aria-label="Cabang berikutnya"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Quick Edit, Copy, and Delete buttons for User message */}
                  {isUser && !isEditing && (
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingNodeId(node.id);
                          setEditingText(node.content);
                        }}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer transition-colors"
                        title="Edit pesan (membuka cabang percakapan baru)"
                        aria-label="Edit pesan user"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleCopy(node.id, node.content)}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer transition-colors"
                        title="Salin pesan"
                        aria-label="Salin pesan user"
                      >
                        {copiedNodeId === node.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteNode(node)}
                        className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 cursor-pointer transition-colors"
                        title="Hapus pesan ini"
                        aria-label="Hapus pesan user"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Message Bubble Body */}
                <div
                  className={`w-full max-w-[92%] sm:max-w-[88%] rounded-xl text-[11px] leading-relaxed transition-all shadow-md ${
                    isUser
                      ? "bg-blue-600 text-white font-medium p-3"
                      : "bg-[#0F1115] text-gray-200 border border-[#1F2937] p-3"
                  }`}
                >
                  {isEditing ? (
                    /* Edit Mode */
                    <div className="space-y-2">
                      <textarea
                        ref={editTextareaRef}
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey || (isUser && !e.shiftKey))) {
                            e.preventDefault();
                            if (isUser) {
                              handleSaveUserEdit(node);
                            } else {
                              handleSaveAiEditNewBranch(node);
                            }
                          } else if (e.key === "Escape") {
                            setEditingNodeId(null);
                          }
                        }}
                        rows={Math.min(8, Math.max(3, editingText.split("\n").length + 1))}
                        className={`w-full p-2 text-xs rounded border focus:outline-hidden resize-y leading-relaxed ${
                          isUser
                            ? "bg-blue-950/80 border-blue-400/50 text-white placeholder-blue-300 focus:border-white"
                            : "bg-[#14171D] border-gray-700 text-gray-100 placeholder-gray-500 focus:border-blue-500"
                        }`}
                        placeholder="Tulis pesan..."
                      />

                      {/* Edit Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[9px] opacity-70">
                          {isUser
                            ? "Enter: Kirim cabang baru • Esc: Batal"
                            : "Ctrl+Enter: Simpan cabang • Esc: Batal"}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingNodeId(null)}
                            className="px-2 py-1 rounded bg-black/30 hover:bg-black/50 text-gray-200 font-medium text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>Batal</span>
                          </button>

                          {isUser ? (
                            <button
                              type="button"
                              onClick={() => handleSaveUserEdit(node)}
                              disabled={!editingText.trim() || isLoading}
                              className="px-2.5 py-1 rounded bg-white text-blue-700 hover:bg-blue-50 font-semibold text-[10px] flex items-center gap-1 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3 h-3" />
                              <span>Kirim</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveAiEditInPlace(node)}
                                disabled={!editingText.trim()}
                                className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 font-medium text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                                title="Perbarui respon ini secara langsung"
                              >
                                <span>Simpan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveAiEditNewBranch(node)}
                                disabled={!editingText.trim()}
                                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[10px] flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                                title="Simpan sebagai respon baru (cabang B) agar respon A dan B dapat dinavigasi"
                              >
                                <GitBranch className="w-3 h-3" />
                                <span>Simpan Cabang</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <>
                      <ChatMessageContent
                        content={node.content}
                        isUser={isUser}
                      />

                      {/* User Bubble Action Bar (Edit, Salin, Hapus) */}
                      {isUser && (
                        <div className="mt-2 pt-1.5 border-t border-blue-500/40 flex items-center justify-end gap-1.5 text-[10px] text-blue-100">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNodeId(node.id);
                              setEditingText(node.content);
                            }}
                            className="px-1.5 py-0.5 rounded hover:bg-white/15 text-blue-100 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                            title="Edit pertanyaan ini"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(node.id, node.content)}
                            className="px-1.5 py-0.5 rounded hover:bg-white/15 text-blue-100 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                            title="Salin pesan pertanyaan"
                          >
                            {copiedNodeId === node.id ? (
                              <>
                                <Check className="w-2.5 h-2.5 text-emerald-300" />
                                <span>Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-2.5 h-2.5" />
                                <span>Salin</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNode(node)}
                            className="px-1.5 py-0.5 rounded hover:bg-red-600/80 bg-blue-700/60 text-blue-100 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                            title="Hapus pertanyaan ini"
                          >
                            <Trash2 className="w-2.5 h-2.5 text-red-200" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      )}

                      {/* AI Bubble Action Bar (Edit, Regenerate, Copy, Hapus, Branch Navigation) */}
                      {!isUser && (
                        <div className="mt-2.5 pt-2 border-t border-[#1F2937]/70 flex items-center justify-between gap-2 text-[10px] text-gray-400">
                          {/* Left: Model Badge & Branch count */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono flex items-center gap-1">
                              <Cpu className="w-2.5 h-2.5" />
                              {formatModelName(node.model || selectedModel)}
                            </span>
                            {hasBranches && (
                              <span className="text-[9px] text-gray-400 font-mono flex items-center gap-0.5">
                                <GitBranch className="w-2.5 h-2.5 text-blue-400" />
                                {variantIndex + 1}/{totalVariants}
                              </span>
                            )}
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center gap-1">
                            {/* Edit AI Response Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNodeId(node.id);
                                setEditingText(node.content);
                              }}
                              className="px-1.5 py-1 rounded hover:bg-white/10 text-gray-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                              title="Edit isi respon AI (dapat disimpan sebagai cabang baru)"
                            >
                              <Pencil className="w-3 h-3" />
                              <span className="hidden xs:inline sm:inline">Edit</span>
                            </button>

                            {/* Regenerate AI Response Button */}
                            <button
                              type="button"
                              disabled={isLoading || isRegenerating}
                              onClick={() => handleRegenerateAi(node)}
                              className="px-1.5 py-1 rounded hover:bg-white/10 text-gray-400 hover:text-blue-300 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                              title={`Regenerate dengan ${currentModelOption.name} (memicu cabang respon baru)`}
                            >
                              <RotateCcw
                                className={`w-3 h-3 ${isRegenerating ? "animate-spin text-blue-400" : ""}`}
                              />
                              <span className="hidden xs:inline sm:inline">
                                {isRegenerating ? "Membuat..." : "Regenerate"}
                              </span>
                            </button>

                            {/* Copy AI Response Button */}
                            <button
                              type="button"
                              onClick={() => handleCopy(node.id, node.content)}
                              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                              title="Salin isi jawaban"
                            >
                              {copiedNodeId === node.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>

                            {/* Delete AI Response Button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteNode(node)}
                              className="px-1.5 py-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Hapus jawaban AI ini"
                            >
                              <Trash2 className="w-3 h-3 text-red-400" />
                              <span className="hidden xs:inline sm:inline">Hapus</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Mulai Percakapan Baru button after messages */}
        {thread.length > 0 && (
          <div className="flex items-center justify-center pt-2 pb-1">
            <button
              type="button"
              onClick={handleClearChat}
              className="text-[11px] text-gray-400 hover:text-red-400 flex items-center gap-1.5 py-1 px-3 rounded-full hover:bg-red-500/10 border border-[#232D3F] hover:border-red-500/30 transition-all cursor-pointer font-medium"
              title="Hapus percakapan saat ini dan mulai obrolan baru"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
              <span>Mulai Percakapan Baru (Clear Chat)</span>
            </button>
          </div>
        )}

        {/* Global Loading Indicator */}
        {isLoading && !regeneratingNodeId && (
          <div className="flex items-center gap-2 text-gray-400 text-[11px] font-mono animate-pulse pl-2 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>MENGANALISIS DENGAN {currentModelOption.name.toUpperCase()}...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Form */}
      <form onSubmit={handleSendMessage} className="p-2.5 border-t border-[#1F2937] flex gap-1.5">
        <input
          type="text"
          placeholder={`Tanyakan pada ${currentModelOption.name}...`}
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          disabled={isLoading}
          className="flex-1 px-3 py-1.5 rounded-lg border border-[#1F2937] bg-[#0F1115] text-gray-200 text-xs focus:outline-hidden focus:border-blue-500 placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || isLoading}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-xs"
          title={`Kirim pertanyaan ke ${currentModelOption.name}`}
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </form>
      {/* AI Personality Modal Dialog */}
      <AiPersonalityModal
        isOpen={isPersonalityModalOpen}
        onClose={() => setIsPersonalityModalOpen(false)}
        currentConfig={personalityConfig}
        onSave={(newCfg) => setPersonalityConfig(newCfg)}
      />

      {/* In-App Delete & Clear Confirmation Modal (Reliable in sandboxed iframes) */}
      <ConfirmDeleteModal
        isOpen={deleteConfirmState.isOpen}
        onClose={() => setDeleteConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleExecuteConfirmedDelete}
        title={deleteConfirmState.title}
        description={deleteConfirmState.description}
        dangerLevel={deleteConfirmState.dangerLevel}
        confirmText={deleteConfirmState.type === "clear_all" ? "Ya, Clear Chat" : "Ya, Hapus"}
        cancelText="Batal"
      />
    </div>
  );
};
