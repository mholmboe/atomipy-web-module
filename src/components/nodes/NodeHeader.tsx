import React from 'react';
import { X, LucideIcon, AlertTriangle } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { NodeHelpButton } from './nodeHelp';
import { useNodeRunStatus } from './nodeRunStatus';

interface NodeHeaderProps {
  id: string;
  title: string;
  Icon: LucideIcon;
  colorClass?: string;
  className?: string;
  /** Key into NODE_HELP — when set (and content exists) a help (?) icon appears. */
  helpKey?: string;
  /** Optional extra action button(s), rendered just before the help icon. */
  extraActions?: React.ReactNode;
}

export const NodeHeader = ({ id, title, Icon, colorClass = "text-primary", className = "bg-primary/10", helpKey, extraActions }: NodeHeaderProps) => {
  const { deleteElements, getNode } = useReactFlow();
  // Auto-derive the help key from the node's type, so any node whose type has
  // a NODE_HELP entry shows the (?) icon without per-node wiring. An explicit
  // helpKey prop overrides it.
  const resolvedHelpKey = helpKey ?? getNode(id)?.type;
  const { errors } = useNodeRunStatus();
  const runError = errors?.[id];

  return (
    <>
      <div className={`${className} p-3 border-b border-border flex items-center justify-between pointer-events-auto`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${colorClass}`} />
          <h3 className="text-sm font-semibold text-foreground m-0">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {extraActions}
          <NodeHelpButton helpKey={resolvedHelpKey} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteElements({ nodes: [{ id }] });
            }}
            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
            title="Delete Node"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {runError && (
        <div
          className="bg-red-500/15 border-b border-red-500/40 px-3 py-1.5 flex items-start gap-1.5 pointer-events-auto"
          title={runError}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-px" />
          <span className="text-[10px] leading-snug text-red-700 dark:text-red-300 line-clamp-3 break-words">
            {runError}
          </span>
        </div>
      )}
    </>
  );
};
