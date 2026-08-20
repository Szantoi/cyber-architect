import React, { useState } from 'react';

const NODES = [
  { id: 'rag', label: 'AI RAG Core', category: 'AI', x: 250, y: 150, color: '#00FFFF', docSlug: 'zart-rag-architektura-specifikacio' },
  { id: 'sqlite', label: 'SQLite WAL & FTS5', category: 'Database', x: 450, y: 120, color: '#80FF00', docSlug: 'zart-rag-architektura-specifikacio' },
  { id: 'vectors', label: 'Dense Embeddings', category: 'Algorithm', x: 150, y: 280, color: '#00FFFF', docSlug: 'zart-rag-architektura-specifikacio' },
  { id: 'cad', label: 'AutoCAD .NET API', category: 'Engineering', x: 650, y: 220, color: '#FF00FF', docSlug: 'belso-cad-api-fejlesztesi-naplo' },
  { id: 'python', label: 'Python Automation', category: 'Backend', x: 400, y: 320, color: '#80FF00', docSlug: 'szigetrendszerek-es-excel-kivaltasa' },
  { id: 'security', label: 'Zero-Trust RBAC', category: 'Security', x: 250, y: 420, color: '#FF00FF', docSlug: 'vallalati-ai-adatbiztonsag-rag' },
  { id: 'integration', label: 'ERP / CRM Sync', category: 'System', x: 550, y: 380, color: '#00FFFF', docSlug: 'szigetrendszerek-es-excel-kivaltasa' }
];

const EDGES = [
  { from: 'rag', to: 'sqlite' },
  { from: 'rag', to: 'vectors' },
  { from: 'rag', to: 'security' },
  { from: 'sqlite', to: 'python' },
  { from: 'python', to: 'integration' },
  { from: 'cad', to: 'integration' },
  { from: 'security', to: 'rag' }
];

const KnowledgeMeshExplorer = ({ onSelectDoc }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  const getNode = (id) => NODES.find(n => n.id === id);
  const selectNode = (node) => {
    setSelectedNode(node);
    if (onSelectDoc && node.docSlug) {
      onSelectDoc(node.docSlug);
    }
  };

  return (
    <div className="border-2 dark:border-white/10 border-slate-900 bg-[var(--surface-panel)] p-6 relative rounded-none shadow-[6px_6px_0_#0f172a] dark:shadow-none mb-8">
      <div className="corner-bracket-tl text-neonCyan"></div>
      <div className="corner-bracket-br text-neonMagenta"></div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b-2 dark:border-white/10 border-slate-900">
        <div>
          <div className="flex items-center gap-2 text-neonCyan font-mono text-[10px] font-black uppercase tracking-widest mb-1">
            <span className="material-symbols-outlined text-sm">hub</span>
            KNOWLEDGE_MESH_TOPOLOGY // VIZUÁLIS CSOMÓPONT-HÁLÓZAT
          </div>
          <h3 className="text-xl font-headline font-black italic uppercase text-on-surface">
            Interaktív Technológiai Kapcsolati Térkép
          </h3>
        </div>
        <div className="font-mono text-xs text-slate-500">
          [KATTINTS EGY CSOMÓPONTRA A RÉSZLETEKHEZ]
        </div>
      </div>

      <div className="relative w-full h-[480px] bg-slate-950/80 border border-white/5 overflow-hidden flex items-center justify-center">
        <svg className="w-full h-full" viewBox="0 0 800 500" role="group" aria-label="Interaktív technológiai kapcsolati térkép">
          {/* Grid background lines */}
          <defs>
            <pattern id="cyber-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cyber-grid)" />

          {/* Render Connections */}
          {EDGES.map((edge, idx) => {
            const source = getNode(edge.from);
            const target = getNode(edge.to);
            if (!source || !target) return null;

            const isHighlighted = (selectedNode && (selectedNode.id === source.id || selectedNode.id === target.id)) ||
                                  (hoveredNode && (hoveredNode.id === source.id || hoveredNode.id === target.id));

            return (
              <line
                key={idx}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={isHighlighted ? '#00FFFF' : 'rgba(255,255,255,0.15)'}
                strokeWidth={isHighlighted ? 2.5 : 1}
                strokeDasharray={isHighlighted ? 'none' : '4,4'}
                className="transition-all duration-300"
              />
            );
          })}

          {/* Render Nodes */}
          {NODES.map((node) => {
            const isSelected = selectedNode?.id === node.id;
            const isHovered = hoveredNode?.id === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="knowledge-node cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-label={`${node.label} csomópont megnyitása`}
                onClick={() => selectNode(node)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectNode(node);
                  }
                }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Node Outer Ring */}
                <rect
                  x="-35"
                  y="-18"
                  width="70"
                  height="36"
                  fill="#090d1d"
                  stroke={isSelected ? '#FF00FF' : isHovered ? '#00FFFF' : node.color}
                  strokeWidth={isSelected || isHovered ? 2 : 1}
                  className="transition-all duration-200"
                />

                {/* Node Label */}
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                  className="select-none pointer-events-none"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 border-2 border-neonCyan p-4 font-mono text-xs shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <span className="text-neonCyan font-bold">KIVÁLASZTOTT CSOMÓPONT:</span> <strong className="text-white uppercase">{selectedNode.label}</strong> [{selectedNode.category}]
            </div>
            {selectedNode.docSlug && onSelectDoc && (
              <button
                type="button"
                onClick={() => onSelectDoc(selectedNode.docSlug)}
                className="px-4 py-1.5 bg-neonCyan text-black font-black uppercase text-[10px] hover:bg-white transition-all shadow-[2px_2px_0_#0f172a]"
              >
                KAPCSOLÓDÓ DOKUMENTUM MEGNYITÁSA ➔
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeMeshExplorer;
