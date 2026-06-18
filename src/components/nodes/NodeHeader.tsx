import React from 'react';
import { X, LucideIcon } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { NodeHelpButton } from './nodeHelp';

interface NodeHeaderProps {
  id: string;
  title: string;
  Icon: LucideIcon;
  colorClass?: string;
  className?: string;
  /** Key into NODE_HELP — when set (and content exists) a help (?) icon appears. */
  helpKey?: string;
}

export const NodeHeader = ({ id, title, Icon, colorClass = "text-primary", className = "bg-primary/10", helpKey }: NodeHeaderProps) => {
  const { deleteElements, getNode } = useReactFlow();
  // Auto-derive the help key from the node's type, so any node whose type has
  // a NODE_HELP entry shows the (?) icon without per-node wiring. An explicit
  // helpKey prop overrides it.
  const resolvedHelpKey = helpKey ?? getNode(id)?.type;

  return (
    <div className={`${className} p-3 border-b border-border flex items-center justify-between pointer-events-auto`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${colorClass}`} />
        <h3 className="text-sm font-semibold text-foreground m-0">{title}</h3>
      </div>
      <div className="flex items-center gap-1">
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
  );
};
