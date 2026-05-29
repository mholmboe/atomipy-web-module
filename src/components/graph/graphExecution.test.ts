import { describe, it, expect } from 'vitest';
import { generatePythonCode } from './graphExecution';
import type { Node, Edge } from '@xyflow/react';

describe('graphExecution Python Generator', () => {
  it('generates correct logic for organic node parametrization', () => {
    const nodes: Node[] = [
      {
        id: 'node-1',
        type: 'organic',
        position: { x: 0, y: 0 },
        data: { smiles: 'CCO', forcefield: 'gaff-2.11' }
      }
    ];
    
    const edges: Edge[] = [];
    
    const code = generatePythonCode(nodes, edges, 'minimal');
    
    expect(code).toContain("ap.parametrize_organic_gaff('CCO', version='gaff-2.11')");
    expect(code).toContain("organic_atoms_0, organic_box_0 = ap.parametrize_organic_gaff");
  });

  it('generates mixed system logic for merge node when organic node is upstream', () => {
    const nodes: Node[] = [
      {
        id: 'org-1',
        type: 'organic',
        position: { x: 0, y: 0 },
        data: { smiles: 'CCO', forcefield: 'gaff-2.11' }
      },
      {
        id: 'clay-1',
        type: 'structure',
        position: { x: 0, y: 100 },
        data: { source: 'preset', value: 'pyrophyllite.pdb' }
      },
      {
        id: 'merge-1',
        type: 'merge',
        position: { x: 100, y: 50 },
        data: { typeMode: 'molid', minDistance: 2.0 }
      }
    ];
    
    const edges: Edge[] = [
      { id: 'e1', source: 'org-1', target: 'merge-1', targetHandle: 'inA' },
      { id: 'e2', source: 'clay-1', target: 'merge-1', targetHandle: 'inB' }
    ];
    
    const code = generatePythonCode(nodes, edges, 'minimal');
    
    // It should contain the ap.mix_systems generation since it sees the organic_atoms upstream
    expect(code).toContain("ap.mix_systems");
    expect(code).toContain("if hasattr(organic_atoms_0, 'atoms') and not isinstance(organic_atoms_0, list):");
  });

  it('generates mixed system logic for export node', () => {
    const nodes: Node[] = [
      {
        id: 'org-1',
        type: 'organic',
        position: { x: 0, y: 0 },
        data: { smiles: 'CCO', forcefield: 'gaff-2.11' }
      },
      {
        id: 'export-1',
        type: 'export',
        position: { x: 100, y: 0 },
        data: { outputName: 'mixed_sys', structureFormat: 'pdb', topologyFormat: 'prmtop' }
      }
    ];
    
    const edges: Edge[] = [
      { id: 'e1', source: 'org-1', target: 'export-1', targetHandle: 'in' }
    ];
    
    const code = generatePythonCode(nodes, edges, 'minimal');
    
    expect(code).toContain("if hasattr(organic_atoms_0, 'atoms') and not isinstance(organic_atoms_0, list):");
    expect(code).toContain("ap.export_mixed(organic_atoms_0, 'mixed_sys', targets=['pdb', 'amber'])");
  });
});
