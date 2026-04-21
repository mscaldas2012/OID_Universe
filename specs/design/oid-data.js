// oid-data.js — plain JS, no Babel needed. Exports to window.

const OID_ROOT_ID = "2.16.840.1.113762";

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function findNode(tree, id) {
  if (!tree) return null;
  if (tree.id === id) return tree;
  for (const c of (tree.children || [])) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

function findParent(tree, id) {
  for (const c of (tree.children || [])) {
    if (c.id === id) return tree;
    const p = findParent(c, id);
    if (p) return p;
  }
  return null;
}

function getBreadcrumb(tree, id) {
  if (tree.id === id) return [tree];
  for (const c of (tree.children || [])) {
    const path = getBreadcrumb(c, id);
    if (path) return [tree, ...path];
  }
  return null;
}

function flattenAll(node, depth = 0) {
  const rows = [{ node, depth }];
  for (const c of (node.children || [])) {
    rows.push(...flattenAll(c, depth + 1));
  }
  return rows;
}

function updateInTree(tree, id, updates) {
  if (tree.id === id) return { ...tree, ...updates, modified: new Date().toISOString().split('T')[0] };
  return { ...tree, children: (tree.children || []).map(c => updateInTree(c, id, updates)) };
}

function addChildInTree(tree, parentId, child) {
  if (tree.id === parentId) {
    return { ...tree, children: [...(tree.children || []), child] };
  }
  return { ...tree, children: (tree.children || []).map(c => addChildInTree(c, parentId, child)) };
}

function removeFromTree(tree, id) {
  return {
    ...tree,
    children: (tree.children || []).filter(c => c.id !== id).map(c => removeFromTree(c, id))
  };
}

function nextArc(parent) {
  const nums = (parent.children || []).map(c => {
    const parts = c.id.split('.');
    return parseInt(parts[parts.length - 1], 10);
  }).filter(n => !isNaN(n));
  return nums.length ? (Math.max(...nums) + 1).toString() : '1';
}

function arcLabel(id) {
  const parts = id.split('.');
  return parts[parts.length - 1];
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTs(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

const INITIAL_TREE = {
  id: "2.16.840.1.113762",
  description: "HL7 Value Set Authority Center (VSAC)",
  status: "active",
  visibility: "public",
  delegation: null,
  created: "2019-03-01",
  modified: "2025-11-10",
  refs: ["https://vsac.nlm.nih.gov"],
  children: [
    {
      id: "2.16.840.1.113762.1",
      description: "Clinical Terminology Resources",
      status: "active",
      visibility: "public",
      delegation: null,
      created: "2019-03-01",
      modified: "2024-08-15",
      refs: [],
      children: [
        {
          id: "2.16.840.1.113762.1.4",
          description: "Value Set Definitions",
          status: "active",
          visibility: "public",
          delegation: { org: "HL7 International", contact: "vocab@hl7.org" },
          created: "2019-06-15",
          modified: "2025-01-20",
          refs: ["https://www.hl7.org/fhir/valueset.html"],
          children: [
            {
              id: "2.16.840.1.113762.1.4.1",
              description: "VSAC Authored Value Sets",
              status: "active",
              visibility: "public",
              delegation: null,
              created: "2020-01-10",
              modified: "2025-03-15",
              refs: [],
              children: [
                {
                  id: "2.16.840.1.113762.1.4.1.6",
                  description: "Smoking Status Codes",
                  status: "active",
                  visibility: "public",
                  delegation: null,
                  created: "2020-02-20",
                  modified: "2024-11-01",
                  refs: [],
                  children: []
                },
                {
                  id: "2.16.840.1.113762.1.4.1.44",
                  description: "Patient Encounter Codes",
                  status: "deprecated",
                  visibility: "public",
                  delegation: null,
                  created: "2020-04-12",
                  modified: "2023-06-30",
                  refs: [],
                  children: []
                },
                {
                  id: "2.16.840.1.113762.1.4.1.103",
                  description: "Chronic Kidney Disease Stages",
                  status: "active",
                  visibility: "public",
                  delegation: null,
                  created: "2021-08-09",
                  modified: "2024-07-14",
                  refs: [],
                  children: []
                }
              ]
            },
            {
              id: "2.16.840.1.113762.1.4.2",
              description: "Internal Draft Value Sets",
              status: "active",
              visibility: "private",
              delegation: null,
              created: "2021-05-08",
              modified: "2025-04-01",
              refs: [],
              children: [
                {
                  id: "2.16.840.1.113762.1.4.2.1",
                  description: "Experimental Oncology Codes",
                  status: "active",
                  visibility: "private",
                  delegation: null,
                  created: "2022-09-14",
                  modified: "2025-02-28",
                  refs: [],
                  children: []
                },
                {
                  id: "2.16.840.1.113762.1.4.2.2",
                  description: "Pediatric Dosing Trials — Draft",
                  status: "active",
                  visibility: "private",
                  delegation: null,
                  created: "2023-01-22",
                  modified: "2025-03-12",
                  refs: [],
                  children: []
                }
              ]
            }
          ]
        },
        {
          id: "2.16.840.1.113762.1.99",
          description: "Reserved — Administrative",
          status: "disabled",
          visibility: "private",
          delegation: null,
          created: "2019-12-01",
          modified: "2022-01-10",
          refs: [],
          children: []
        }
      ]
    },
    {
      id: "2.16.840.1.113762.2",
      description: "Drug Terminology Registry",
      status: "active",
      visibility: "public",
      delegation: { org: "FDA Office of Terminology", contact: "terminology@fda.gov" },
      created: "2020-07-22",
      modified: "2025-04-10",
      refs: ["https://www.fda.gov/drugs/drug-approvals-and-databases"],
      children: [
        {
          id: "2.16.840.1.113762.2.1",
          description: "NDC Code Mappings",
          status: "active",
          visibility: "public",
          delegation: null,
          created: "2021-02-14",
          modified: "2025-04-10",
          refs: [],
          children: []
        },
        {
          id: "2.16.840.1.113762.2.2",
          description: "RxNorm Concept Assignments",
          status: "active",
          visibility: "public",
          delegation: null,
          created: "2022-06-01",
          modified: "2025-01-18",
          refs: ["https://www.nlm.nih.gov/research/umls/rxnorm/"],
          children: []
        }
      ]
    },
    {
      id: "2.16.840.1.113762.3",
      description: "Laboratory Observation Identifiers",
      status: "active",
      visibility: "public",
      delegation: { org: "Regenstrief Institute", contact: "loinc@regenstrief.org" },
      created: "2021-11-03",
      modified: "2024-12-19",
      refs: ["https://loinc.org"],
      children: []
    }
  ]
};

const INITIAL_AUDIT = [
  { id:1, ts:"2025-04-18T14:32:00Z", user:"admin@example.com", action:"UPDATE", nodeId:"2.16.840.1.113762.1.4.2.1", detail:'description → "Experimental Oncology Codes"' },
  { id:2, ts:"2025-04-15T09:11:00Z", user:"j.smith@example.com", action:"CREATE", nodeId:"2.16.840.1.113762.1.4.2.2", detail:"node created" },
  { id:3, ts:"2025-03-30T16:44:00Z", user:"admin@example.com", action:"DISABLE", nodeId:"2.16.840.1.113762.1.99", detail:"status: active → disabled" },
  { id:4, ts:"2025-03-20T11:22:00Z", user:"admin@example.com", action:"UPDATE", nodeId:"2.16.840.1.113762", detail:"modified timestamp updated" },
  { id:5, ts:"2025-01-20T08:05:00Z", user:"delegate@hl7.org", action:"DELEGATE", nodeId:"2.16.840.1.113762.1.4", detail:"delegated to HL7 International" },
  { id:6, ts:"2024-11-01T15:33:00Z", user:"admin@example.com", action:"UPDATE", nodeId:"2.16.840.1.113762.1.4.1.6", detail:"status: draft → active" },
  { id:7, ts:"2024-08-15T10:00:00Z", user:"j.smith@example.com", action:"CREATE", nodeId:"2.16.840.1.113762.1.4.1.44", detail:"node created" },
  { id:8, ts:"2024-07-14T09:02:00Z", user:"admin@example.com", action:"UPDATE", nodeId:"2.16.840.1.113762.1.4.1.103", detail:"visibility: private → public" },
];

Object.assign(window, {
  OID_ROOT_ID, deepClone, findNode, findParent, getBreadcrumb, flattenAll,
  updateInTree, addChildInTree, removeFromTree, nextArc, arcLabel, fmtDate, fmtTs,
  INITIAL_TREE, INITIAL_AUDIT
});
