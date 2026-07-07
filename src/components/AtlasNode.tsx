import { Handle, Position, NodeProps } from 'reactflow';

export default function AtlasNode({ data }: NodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      
      <div className="flex items-center justify-between gap-2 h-full w-full relative">
        <span className={`truncate flex-grow text-center ${data.isLoading ? 'opacity-50' : ''}`} style={{ lineHeight: '1.2' }}>
          {data.label}
        </span>
        
        {data.nodeData?.kind === 'referendum' && !data.isLoading && (
          <button 
            className="flex-none w-5 h-5 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-[10px] font-bold transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (data.onInfoClick) data.onInfoClick(data.nodeData.id);
            }}
            title="Fetch Description"
          >
            i
          </button>
        )}

        {data.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </>
  );
}
