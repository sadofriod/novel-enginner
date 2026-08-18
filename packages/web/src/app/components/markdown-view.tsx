import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders markdown prose as HTML using react-markdown (remark ecosystem), with
 * styling consistent with the console's MUI theme. Deliberately does NOT enable
 * rehype-raw: raw HTML inside markdown is escaped, keeping the reader safe.
 * The canonical filesystem stays markdown — this is a display-layer-only renderer.
 */
export function MarkdownView({ content }: { readonly content: string }) {
  return (
    <Box
      component="div"
      sx={{
        '& h1, & h2, & h3, & h4, & h5, & h6': {
          fontWeight: 700,
          lineHeight: 1.4,
          margin: '1.25em 0 0.5em',
        },
        '& h1': { fontSize: '1.55rem' },
        '& h2': { fontSize: '1.3rem' },
        '& h3': { fontSize: '1.12rem' },
        '& h4, & h5, & h6': { fontSize: '1rem' },
        '& p': { lineHeight: 1.9, margin: '0.75em 0' },
        '& ul, & ol': { paddingLeft: '1.5em', margin: '0.75em 0', lineHeight: 1.8 },
        '& blockquote': {
          borderLeft: '3px solid #e0e0e0',
          margin: '0.75em 0',
          paddingLeft: '0.9em',
          color: 'text.secondary',
        },
        '& a': { color: '#1565c0', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
        '& code': {
          background: '#f5f5f5',
          borderRadius: '4px',
          padding: '0.15em 0.35em',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.9em',
        },
        '& pre': { background: '#f5f5f5', borderRadius: '6px', padding: '1em', overflowX: 'auto' },
        '& pre code': { background: 'transparent', padding: 0 },
        '& table': { borderCollapse: 'collapse', margin: '0.75em 0', width: '100%' },
        '& th, & td': { border: '1px solid #e0e0e0', padding: '0.4em 0.7em', textAlign: 'left' },
        '& hr': { border: 'none', borderTop: '1px solid #e0e0e0', margin: '1.5em 0' },
        '& img': { maxWidth: '100%' },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </Box>
  );
}
