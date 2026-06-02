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

    // The spatial Merge node guards against itp-bearing (organic) inputs and
    // redirects topology merges to the 'Add' node; mineral-only inputs go
    // through ap.merge.
    expect(code).toContain("if hasattr(organic_atoms_0, 'itp') or hasattr(structure_atoms_1, 'itp'):");
    expect(code).toContain("please use the 'Add' node instead.");
    expect(code).toContain("merged_2 = ap.merge(organic_atoms_0, structure_atoms_1, organic_box_0, type_mode='molid', min_distance=2)");
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
        data: { outputName: 'mixed_sys', structureFormat: 'pdb', topologyFormat: 'itp' }
      }
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'org-1', target: 'export-1', targetHandle: 'in' }
    ];

    const code = generatePythonCode(nodes, edges, 'minimal');

    // Structure is written unconditionally; GROMACS topology writes a full,
    // self-contained .top (write_merged_top when an itp is present) plus a
    // modular .itp for the inorganic part.
    expect(code).toContain("ap.write_pdb(list(organic_atoms_0), organic_box_0, 'mixed_sys.pdb', write_conect=False, write_element=True)");
    expect(code).toContain("if hasattr(organic_atoms_0, 'itp') and organic_atoms_0.itp is not None:");
    expect(code).toContain("ap.write_merged_top(list(organic_atoms_0), organic_atoms_0.itp,");
    expect(code).toContain("'mixed_sys.top'");
    expect(code).toContain("ap.write_itp(_inorg,");
  });
});
