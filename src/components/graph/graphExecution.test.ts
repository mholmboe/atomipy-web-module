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
    
    // basename names the GROMACS moleculetype; a single organic stays 'organic'.
    expect(code).toContain("ap.parametrize_organic_gaff('CCO', version='gaff-2.11', basename='organic')");
    expect(code).toContain("organic_atoms_0, organic_box_0 = ap.parametrize_organic_gaff");
  });

  it('names multiple distinct organics organic_1 / organic_2', () => {
    const nodes: Node[] = [
      { id: 'orgA', type: 'structure', position: { x: 0, y: 0 }, data: { source: 'organic', smiles: 'CO' } },
      { id: 'orgB', type: 'structure', position: { x: 0, y: 100 }, data: { source: 'organic', smiles: 'CCO' } },
      { id: 'add1', type: 'add', position: { x: 100, y: 50 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'orgA', target: 'add1', targetHandle: 'in' },
      { id: 'e2', source: 'orgB', target: 'add1', targetHandle: 'in' },
    ];
    const code = generatePythonCode(nodes, edges, 'minimal');
    expect(code).toContain("ap.parametrize_organic_gaff('CO', version='gaff-2.11', basename='organic_1')");
    expect(code).toContain("ap.parametrize_organic_gaff('CCO', version='gaff-2.11', basename='organic_2')");
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
    // self-contained .top via write_merged_top (organics #included) plus a
    // modular .itp for the inorganic part.
    expect(code).toContain("ap.write_pdb(list(organic_atoms_0), organic_box_0, 'mixed_sys.pdb', write_conect=False, write_element=True)");
    expect(code).toContain("from atomipy.classify import classify_atom as _classify");
    expect(code).toContain("ap.write_merged_top(list(organic_atoms_0), _exp_itp,");
    expect(code).toContain("'mixed_sys.top'");
    expect(code).toContain("ap.write_itp(_inorg,");
  });

  it('generates join_and_reorder logic for add node', () => {
    const nodes: Node[] = [
      { id: 'org-1', type: 'organic', position: { x: 0, y: 0 }, data: { smiles: 'CCO', forcefield: 'gaff-2.11' } },
      { id: 'clay-1', type: 'structure', position: { x: 0, y: 100 }, data: { source: 'preset', value: 'pyrophyllite.pdb' } },
      { id: 'add-1', type: 'add', position: { x: 100, y: 50 }, data: { reorder: true } }
    ];
    
    const edges: Edge[] = [
      { id: 'e1', source: 'org-1', target: 'add-1', targetHandle: 'in' },
      { id: 'e2', source: 'clay-1', target: 'add-1', targetHandle: 'in' }
    ];
    
    const code = generatePythonCode(nodes, edges, 'minimal');
    expect(code).toContain("ap.join_and_reorder(*_list_branches)");
  });

  it('replicates an organic as nx*ny*nz molecules and preserves its .itp', () => {
    const nodes: Node[] = [
      { id: 'org-1', type: 'organic', position: { x: 0, y: 0 }, data: { smiles: 'CCO', forcefield: 'gaff-2.11' } },
      { id: 'rep-1', type: 'replicate', position: { x: 100, y: 0 }, data: { x: 2, y: 2, z: 1 } },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'org-1', target: 'rep-1', targetHandle: 'in' },
    ];

    const code = generatePythonCode(nodes, edges, 'minimal');

    // Topology-carrying input -> distinct molids (so [ molecules ] count = 2*2*1)
    expect(code).toMatch(/_repl_has_itp = getattr\(\w+, 'itp', None\) is not None/);
    expect(code).toContain("keep_molid=(False if _repl_has_itp else True)");
    // .itp is re-attached to the replicated output (otherwise it'd be dropped)
    expect(code).toMatch(/if _repl_has_itp: \w+\.itp = \w+\.itp/);
    // default (all axes "same") -> organic auto-separates, inorganic stays one molecule
    expect(code).toContain("keep_molid=(False if _repl_has_itp else True)");
  });

  it('replicates clay layers: continuous in x,y but separate molecules in z', () => {
    const nodes: Node[] = [
      { id: 'clay-1', type: 'structure', position: { x: 0, y: 0 }, data: { source: 'preset', value: 'pyrophyllite.pdb' } },
      { id: 'rep-1', type: 'replicate', position: { x: 100, y: 0 },
        data: { x: 2, y: 2, z: 3, sameMoleculeX: true, sameMoleculeY: true, sameMoleculeZ: false } },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'clay-1', target: 'rep-1', targetHandle: 'in' },
    ];

    const code = generatePythonCode(nodes, edges, 'minimal');

    // X and Y are "same molecule" (one continuous layer); Z is "separate".
    expect(code).toContain("replicate=[2, 1, 1], keep_molid=(False if _repl_has_itp else True)");
    expect(code).toContain("replicate=[1, 2, 1], keep_molid=(False if _repl_has_itp else True)");
    expect(code).toContain("replicate=[1, 1, 3], keep_molid=False");
    // Separate axis (Z) must be applied AFTER the same axes (X, Y) so molids stay contiguous.
    expect(code.indexOf("replicate=[1, 1, 3]")).toBeGreaterThan(code.indexOf("replicate=[2, 1, 1]"));
    expect(code.indexOf("replicate=[1, 1, 3]")).toBeGreaterThan(code.indexOf("replicate=[1, 2, 1]"));
  });

  it('topology editor attaches a [molecules] override that export forwards', () => {
    const nodes: Node[] = [
      { id: 'org-1', type: 'organic', position: { x: 0, y: 0 }, data: { smiles: 'CCO', forcefield: 'gaff-2.11' } },
      { id: 'topo-1', type: 'topology', position: { x: 100, y: 0 },
        data: { molecules: [{ name: 'organic', count: '3' }, { name: 'SOL', count: '196' }, { name: '', count: '' }] } },
      { id: 'exp-1', type: 'export', position: { x: 200, y: 0 },
        data: { outputName: 'sys', structureFormat: 'pdb', topologyFormat: 'itp' } },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'org-1', target: 'topo-1', targetHandle: 'in' },
      { id: 'e2', source: 'topo-1', target: 'exp-1', targetHandle: 'in' },
    ];

    const code = generatePythonCode(nodes, edges, 'minimal');

    // Editor rows -> explicit override (blank rows dropped); export forwards it.
    expect(code).toContain("._mol_counts_override = [('organic', 3), ('SOL', 196)]");
    expect(code).toContain("mol_counts_override=getattr(");
    // The node emits the detected sequence so the editor can auto-populate.
    expect(code).toContain("print('__MOLSEQ__topo-1=");
    expect(code).toContain("ap.get_mol_sequence_typed(");
  });
});
