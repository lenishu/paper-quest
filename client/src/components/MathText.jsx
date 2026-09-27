import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Models emit math in several dialects; normalize \( \) / \[ \] to the $-delimiters remark-math expects.
export function normalizeMath(s) {
  return String(s ?? '')
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$${m}$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);
}

// Inline-friendly markdown+KaTeX renderer for short model-generated strings
// (quiz questions/options/explanations, concept blurbs, "used in paper" notes).
export default function MathText({ children, className = '' }) {
  return (
    <span className={`mathtext ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{ p: ({ node, ...props }) => <span className="mt-p" {...props} /> }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </span>
  );
}
