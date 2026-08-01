import type { EvidenceRow } from "../lib/db";

export type DraftEvidenceRow = Omit<EvidenceRow, "id" | "created_at" | "signal_id">;

interface Props {
  rows: DraftEvidenceRow[];
  onChange: (rows: DraftEvidenceRow[]) => void;
}

function emptyRow(sortOrder: number): DraftEvidenceRow {
  return {
    tier: "1",
    direction: "supports",
    cluster_no: sortOrder + 1,
    source_name: "",
    source_url: "",
    description: "",
    sort_order: sortOrder,
  };
}

export function EvidenceEditor({ rows, onChange }: Props) {
  function updateRow(index: number, patch: Partial<DraftEvidenceRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...rows, emptyRow(rows.length)]);
  }

  const clusterCount = new Set(rows.map((r) => r.cluster_no)).size;

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6e6e73" }}>
        {rows.length} evidence item{rows.length === 1 ? "" : "s"} · {clusterCount} cluster
        {clusterCount === 1 ? "" : "s"} (computed from distinct cluster numbers — this is what
        the public page will show)
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #d2d2d7" }}>
            <th>Tier</th>
            <th>Direction</th>
            <th>Cluster #</th>
            <th>Source</th>
            <th>URL</th>
            <th>Description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>
                <select
                  value={row.tier}
                  onChange={(e) => updateRow(i, { tier: e.target.value as DraftEvidenceRow["tier"] })}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </td>
              <td>
                <select
                  value={row.direction}
                  onChange={(e) =>
                    updateRow(i, { direction: e.target.value as DraftEvidenceRow["direction"] })
                  }
                >
                  <option value="supports">Supports</option>
                  <option value="contradicts">Contradicts</option>
                </select>
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  value={row.cluster_no}
                  onChange={(e) => updateRow(i, { cluster_no: Number(e.target.value) })}
                  style={{ width: 56 }}
                />
              </td>
              <td>
                <input
                  value={row.source_name}
                  onChange={(e) => updateRow(i, { source_name: e.target.value })}
                  placeholder="Source name"
                />
              </td>
              <td>
                <input
                  value={row.source_url ?? ""}
                  onChange={(e) => updateRow(i, { source_url: e.target.value })}
                  placeholder="https://…"
                />
              </td>
              <td>
                <input
                  value={row.description}
                  onChange={(e) => updateRow(i, { description: e.target.value })}
                  placeholder="What it shows"
                  style={{ width: "100%" }}
                />
              </td>
              <td>
                <button type="button" onClick={() => removeRow(i)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addRow} style={{ marginTop: 8 }}>
        + Add evidence
      </button>
    </div>
  );
}
