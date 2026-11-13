import React from "react";
import Markdown from "react-markdown";

interface ChatMessageContentProps {
  content: string;
  isUser?: boolean;
  className?: string;
}

export const ChatMessageContent: React.FC<ChatMessageContentProps> = ({
  content,
  isUser = false,
  className = "",
}) => {
  return (
    <div className={`chat-markdown break-words text-xs leading-relaxed select-text ${className}`}>
      <Markdown
        components={{
          strong: ({ children }) => (
            <strong
              className={`font-bold ${
                isUser ? "text-white font-extrabold" : "text-white"
              }`}
            >
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className={`italic ${isUser ? "text-blue-100" : "text-gray-200"}`}>
              {children}
            </em>
          ),
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              className={`border-l-2 pl-2.5 my-2 italic ${
                isUser
                  ? "border-blue-300 text-blue-100"
                  : "border-blue-500/70 text-gray-300 bg-black/20 py-1 pr-2 rounded-r"
              }`}
            >
              {children}
            </blockquote>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline =
              !codeClassName &&
              typeof children === "string" &&
              !children.includes("\n");
            if (isInline) {
              return (
                <code
                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${
                    isUser
                      ? "bg-blue-800/80 text-blue-100 border border-blue-400/30"
                      : "bg-[#141824] text-amber-300 border border-gray-700/60"
                  }`}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre
                className={`p-2.5 my-2 rounded-lg overflow-x-auto text-[11px] font-mono ${
                  isUser
                    ? "bg-blue-900/90 text-blue-100 border border-blue-500/40"
                    : "bg-[#0B0D13] text-gray-200 border border-gray-800"
                }`}
              >
                <code {...props}>{children}</code>
              </pre>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 hover:opacity-80 transition-opacity ${
                isUser ? "text-white font-medium" : "text-blue-400"
              }`}
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-white mt-3 mb-1.5 pb-1 border-b border-gray-700/50">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-white mt-2.5 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-gray-200 mt-2 mb-1">
              {children}
            </h3>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
};
