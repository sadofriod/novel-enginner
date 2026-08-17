import { createRoot } from 'react-dom/client';
import { CssBaseline, StyledEngineProvider, ThemeProvider, createTheme } from '@mui/material';
import { Provider } from 'react-redux';

import { WebRouter } from './app/WebRouter';
import { store } from './store';

const rootElement = document.getElementById('web-app-root');
const theme = createTheme({
  palette: {
    primary: { main: '#1565c0' },
    secondary: { main: '#00897b' },
    background: { default: '#f8fafc' },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
});

if (rootElement !== null) {
  createRoot(rootElement).render(
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Provider store={store}>
          <WebRouter />
        </Provider>
      </ThemeProvider>
    </StyledEngineProvider>,
  );
}