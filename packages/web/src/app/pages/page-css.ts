export const PAGE_CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;background:#f5f7fb;color:#212121;line-height:1.5}
h1,h2,h3,h4{margin:0;font-weight:700;color:#212121}
p{margin:0}
a{color:#1976d2;text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:ui-monospace,monospace;font-size:0.85em;background:#f5f5f5;padding:1px 4px;border-radius:2px}

/* Page shell */
.page-shell{padding:20px;display:grid;gap:16px;max-width:1600px;margin:0 auto}
.page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding:16px;background:#fff;border:1px solid #e0e0e0;border-radius:4px}
.page-meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;font-size:12px}
.page-meta dt{color:#9e9e9e;font-weight:500}
.page-meta dd{margin:0;font-family:monospace;color:#424242}
.eyebrow{margin:0 0 4px;font-size:11px;color:#9e9e9e;text-transform:uppercase;letter-spacing:0.08em}
.layout-grid{display:grid;grid-template-columns:260px 1fr 300px;gap:12px;align-items:start}

/* Panel */
.panel{background:#fff;border:1px solid #e0e0e0;border-radius:4px;padding:14px}
.panel-main{display:grid;gap:12px}

/* Artifact links */
.artifact-links{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.artifact-link{display:grid;gap:3px;padding:10px 12px;border:1px solid #e0e0e0;border-radius:4px;color:inherit;text-decoration:none;transition:border-color 0.15s,background 0.15s}
.artifact-link:hover{border-color:#90caf9;background:#f8fbff}
.artifact-link-selected{border-color:#1976d2 !important;background:#e3f2fd !important}
.artifact-link strong{font-size:13px;color:#212121}
.artifact-link span{font-size:12px;color:#616161}
.artifact-link small{display:inline-block;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f5f5f5;color:#616161}

/* Artifact meta */
.artifact-meta,.proposal-diff-meta,.derived-graph-meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px}
.artifact-meta dt,.proposal-diff-meta dt,.derived-graph-meta dt{color:#9e9e9e;font-weight:500;white-space:nowrap}
.artifact-meta dd,.proposal-diff-meta dd,.derived-graph-meta dd{margin:0;font-family:monospace;color:#424242}

/* Approval actions */
.approval-actions{display:flex;flex-wrap:wrap;gap:8px}
.approval-action-form{margin:0}
.approval-action-form button{padding:6px 14px;border-radius:4px;border:1px solid #9e9e9e;background:#fff;cursor:pointer;font-size:13px}

/* Inline edit */
.inline-edit textarea{width:100%;padding:8px;border:1px solid #bdbdbd;border-radius:4px;font-size:13px;resize:vertical;font-family:inherit}

/* Tables */
.diff-table,.bundled-fields-table{width:100%;border-collapse:collapse}
.diff-table th,.diff-table td,.bundled-fields-table th,.bundled-fields-table td{border:1px solid #e0e0e0;padding:6px 8px;vertical-align:top;font-size:12px}
.diff-table th,.bundled-fields-table th{background:#fafafa;font-weight:600}
.diff-value,.bundled-field-value{white-space:pre-wrap;margin:0}

/* GitHub-style field diffs (react-diff-viewer-continued) */
.diff-field-block{display:grid;gap:4px;margin:8px 0}
.diff-field-block .diff-field-head{display:flex;align-items:center;gap:8px;font-size:12px}
.diff-field-block .diff-field-head code{font-weight:600;color:#424242}
.diff-field-block .diff-badge{background:#ffebee;color:#c62828;padding:1px 6px;border-radius:10px;font-size:11px;font-weight:600}
.diff-field-block .diff-field-head + div{font-size:12px;line-height:1.5;overflow-x:auto;border:1px solid #e0e0e0;border-radius:4px}

/* Run trace */
.run-trace-list,.bundled-diff-list{padding-left:18px}

/* Derived graph */
.derived-graph-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
`;
